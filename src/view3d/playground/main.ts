/**
 * Playground de modelos 3D (units3d.html): todas las unidades y edificios de Ashfox con la misma luz
 * cartoon que el juego, para afinarlos. Se elige que ver (todo o uno), el lado, la animacion, la
 * velocidad (con pausa y fotograma a fotograma), la torreta y la luz de cada clima, y se recargan los
 * modelos recien exportados sin perder lo elegido. Raton: arrastrar gira, rueda acerca, boton derecho
 * mueve; tocar un modelo da sus datos. Teclas: 1-3 animaciones, espacio pausa, R recarga.
 * `?model=<id|units|buildings>&side=<own|enemy|neutral>` abre con eso elegido.
 */
import '@fontsource/silkscreen/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { defaultContent } from '../../core/content/default';
import type { OwnerSide } from '../../ui/sides';
import { GlbLibrary, type UnitClip } from '../glbModels';
import { World } from '../world';
import { installStyle, Panel, type Catalog } from './panel';
import { Stage, type ModelEntry } from './stage';

/** Cada cuanto se repite el disparo, si se pide (segundos de la animacion). */
const FIRE_EVERY = 1.4;
/** Lo que avanza «un fotograma» (las animaciones de Ashfox van a 20 por segundo). */
const STEP_SECONDS = 1 / 20;
/** Desde donde mira la camara al encuadrar (direccion; la distancia sale de lo que se ve). */
const VIEW_DIRECTION = new THREE.Vector3(0.9, 1.1, 1.3).normalize();
const VIEW_DISTANCE_PER_RADIUS = 3.2;
/** Un clic es un toque si el raton apenas se ha movido (pixeles). */
const CLICK_SLACK = 4;
const KEY_CLIPS: Readonly<Record<string, UnitClip>> = { '1': 'idle', '2': 'drive', '3': 'fire' };

const content = defaultContent();
const catalog: Catalog = {
  units: content.units.list.map((unitType) => unitType.id),
  buildings: content.buildings.list.map((buildingType) => buildingType.id),
};

installStyle();
const world = new World(document.getElementById('stage')!);
let library = await GlbLibrary.load(catalog);
const stage = new Stage(library);
world.scene.add(stage.object);
const orbit = new OrbitControls(world.camera, world.renderer.domElement);
orbit.enableDamping = true;

const address = new URLSearchParams(location.search);
const choice = { view: address.get('model') ?? 'units', side: (address.get('side') ?? 'own') as OwnerSide, clip: 'idle' as UnitClip };
const time = { speed: 1, paused: false, repeatFire: false, sinceFire: 0 };

const panel = new Panel(document.getElementById('panel')!, catalog, {
  view: (view) => show({ view }),
  side: (side) => show({ side }),
  play,
  repeatFire: (on) => (time.repeatFire = on),
  speed: (multiplier) => (time.speed = multiplier),
  togglePause: () => (time.paused = !time.paused),
  step: () => stage.update(STEP_SECONDS),
  aim: (degrees) => stage.aim(degrees),
  weather: (kind) => world.setWeather(kind),
  orbit: (on) => (orbit.autoRotate = on),
  reload: () => void reload(),
});

/** Los modelos de lo que se ha elegido: todas las unidades, todos los edificios o uno. */
function entriesOf(view: string): ModelEntry[] {
  if (view === 'units') return catalog.units.map((id) => ({ kind: 'unit', id }));
  if (view === 'buildings') return catalog.buildings.map((id) => ({ kind: 'building', id }));
  return [{ kind: catalog.buildings.includes(view) ? 'building' : 'unit', id: view }];
}

/** Enseña lo elegido (con los cambios que se pidan), lo encuadra y lo apunta en la direccion. */
function show(change: Partial<Pick<typeof choice, 'view' | 'side'>>): void {
  Object.assign(choice, change);
  stage.show(entriesOf(choice.view), choice.side);
  stage.play(choice.clip);
  frame();
  refreshPanel('');
  history.replaceState(null, '', `?model=${choice.view}&side=${choice.side}`);
}

function play(clip: UnitClip): void {
  choice.clip = clip;
  time.sinceFire = 0;
  stage.play(clip);
  refreshPanel('');
}

/** Pone la camara (y la sombra del sol) para que se vea todo lo que hay. */
function frame(): void {
  const { center, radius } = stage.bounds();
  orbit.target.copy(center);
  world.camera.position.copy(center).addScaledVector(VIEW_DIRECTION, radius * VIEW_DISTANCE_PER_RADIUS);
  world.lightArea(center, radius + 2);
}

function refreshPanel(note: string): void {
  panel.mark(choice.view, choice.side, choice.clip);
  panel.showDetails(stage.details(), note);
}

/** Vuelve a cargar los GLB (preguntando si han cambiado) y pone otra vez lo que se veia. */
async function reload(): Promise<void> {
  library = await GlbLibrary.load(catalog, [], true);
  stage.replaceLibrary(library, choice.side);
  stage.play(choice.clip);
  refreshPanel(`Recargados a las ${new Date().toLocaleTimeString()}.`);
}

/** Avanza el tiempo (a su velocidad) y repite el disparo si se ha pedido. */
function tick(seconds: number): void {
  orbit.update();
  if (time.paused) return;
  const scaled = seconds * time.speed;
  stage.update(scaled);
  if (!time.repeatFire || choice.clip !== 'fire') return;
  time.sinceFire += scaled;
  if (time.sinceFire < FIRE_EVERY) return;
  time.sinceFire = 0;
  stage.play('fire');
}

/** Tocar (sin arrastrar) un modelo lo marca y da sus datos; tocar el suelo lo desmarca. */
function installPicking(canvas: HTMLCanvasElement): void {
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => (down = { x: event.clientX, y: event.clientY }));
  canvas.addEventListener('pointerup', (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_SLACK) return;
    const bounds = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, world.camera);
    const [hit] = raycaster.intersectObjects(stage.pickables(), true);
    stage.select(hit?.object ?? null);
    refreshPanel('');
  });
}

function installKeys(): void {
  window.addEventListener('keydown', (event) => {
    const clip = KEY_CLIPS[event.key];
    if (clip) play(clip);
    else if (event.key === ' ') time.paused = !time.paused;
    else if (event.key.toLowerCase() === 'r') void reload();
    else return;
    event.preventDefault();
  });
}

installPicking(world.renderer.domElement);
installKeys();
world.onFrame(tick);
show({});
world.start();

// Para mirar y probar desde la consola (y los agentes).
(window as unknown as { ilogicPlayground: object }).ilogicPlayground = { world, stage, choice, time, reload };
