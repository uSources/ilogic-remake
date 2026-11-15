/**
 * Prototipo 3D (3d.html): la misma partida, las mismas reglas y la misma sesion que el juego, vistas
 * con three.js en bloques y luz cartoon. Aqui solo se junta todo: cada pieza vive en su modulo.
 */
import * as THREE from 'three';
import { mapGrid } from '../core/mapGrid';
import type { Pos } from '../core/model';
import { BoardView } from './board';
import { CameraRig } from './cameraRig';
import { Highlights } from './highlights';
import { PrototypeControls } from './prototypeControls';
import { startPrototype } from './prototypeMatch';
import { buildTerrain, type TerrainView } from './terrain';
import { World } from './world';
import { installHud } from './hud';

/** Se considera arrastre (y no toque) si el puntero se mueve mas de esto en pixeles. */
const DRAG_THRESHOLD = 6;
const START_DISTANCE = 14;
const START_YAW = Math.PI / 4;

const { session, viewer } = startPrototype();
const state = session.state;
const world = new World(document.getElementById('world')!);
const terrain = buildTerrain(state);
const board = new BoardView(state, viewer, terrain);
const highlights = new Highlights((pos) => board.groundOf(pos));
world.scene.add(terrain.object, board.object, highlights.object);

const grid = mapGrid(state);
const center = new THREE.Vector3((grid.width - 1) / 2, 0, (grid.height - 1) / 2);
world.lightArea(center, Math.max(grid.width, grid.height) * 0.75);
const bounds = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(grid.width - 1, grid.height - 1));
/** La camara empieza mirando a la primera unidad de la persona (o al centro si no tiene). */
const firstUnit = state.units.find((unit) => unit.team === viewer);
const startTarget = firstUnit ? board.groundOf(firstUnit) : center.clone();
const rig = new CameraRig(world.camera, { target: startTarget, distance: START_DISTANCE, yaw: START_YAW }, bounds);

const hud = installHud(document.getElementById('hud3d')!, { onEndTurn: () => controls.endTurn() });
const controls = new PrototypeControls(session, viewer, highlights, { board, animate: (s, step) => world.animate(s, step) }, () => {
  board.sync();
  hud.update(state);
});

/** La casilla bajo un punto de la pantalla: la de la unidad si se toca una, si no la del terreno. */
function tileAt(clientX: number, clientY: number, terrainView: TerrainView): Pos | null {
  const canvas = world.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(((clientX - canvas.left) / canvas.width) * 2 - 1, -((clientY - canvas.top) / canvas.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, world.camera);
  const [hit] = raycaster.intersectObjects([board.object, terrainView.tiles], true);
  if (!hit) return null;
  const uid = board.unitHit(hit.object);
  if (uid !== null) return state.units.find((unit) => unit.uid === uid) ?? null;
  if (hit.object === terrainView.tiles && hit.instanceId !== undefined) return terrainView.tileOfInstance[hit.instanceId] ?? null;
  return { x: Math.round(hit.point.x), y: Math.round(hit.point.z) };
}

/** Arrastrar desplaza la camara; soltar sin arrastrar es tocar la casilla. */
function installPointer(canvas: HTMLCanvasElement): void {
  let press: { x: number; y: number; isDrag: boolean } | null = null;
  canvas.addEventListener('pointerdown', (event) => (press = { x: event.clientX, y: event.clientY, isDrag: false }));
  canvas.addEventListener('pointermove', (event) => {
    highlights.hover(tileAt(event.clientX, event.clientY, terrain));
    if (!press) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > DRAG_THRESHOLD) press.isDrag = true;
    if (!press.isDrag) return;
    const scale = rig.tilesPerPixel(canvas.clientHeight);
    rig.pan(-event.movementX * scale, event.movementY * scale);
  });
  canvas.addEventListener('pointerup', (event) => {
    const wasTap = press && !press.isDrag;
    press = null;
    const pos = wasTap ? tileAt(event.clientX, event.clientY, terrain) : null;
    if (pos) void controls.tap(pos);
  });
  canvas.addEventListener('wheel', (event) => rig.zoom(event.deltaY), { passive: true });
}

/** Teclas que se mantienen (desplazar) y teclas de una vez (girar, fin de turno). */
function installKeys(): void {
  const held = new Set<string>();
  const axis = (positive: string[], negative: string[]) =>
    (positive.some((key) => held.has(key)) ? 1 : 0) - (negative.some((key) => held.has(key)) ? 1 : 0);
  window.addEventListener('keydown', (event) => {
    held.add(event.code);
    if (event.code === 'KeyQ') rig.turn(1);
    if (event.code === 'KeyE') rig.turn(-1);
    if (event.code === 'Enter') controls.endTurn();
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  world.onFrame((seconds) => {
    const right = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const forward = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    if (right || forward) rig.panByKeys(right, forward, seconds);
  });
}

installPointer(world.renderer.domElement);
installKeys();
world.onFrame((seconds) => {
  rig.update(seconds);
  highlights.update(seconds);
});
controls.runUntilInput();
world.start();

// Para mirar y probar desde la consola (y los agentes): la sesion y las piezas.
(window as unknown as { ilogic3d: object }).ilogic3d = { session, board, controls, rig };
