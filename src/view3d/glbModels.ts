/**
 * Modelos GLB hechos con Ashfox (fuentes en tools/art/ashfox, salida en public/assets/models): las
 * unidades, animadas ('idle', 'drive', 'fire'; cada una lleva su copia), los edificios y los fijos
 * del terreno (casillas y decorado), que se dibujan instanciados (`staticParts`). Se busca el de cada
 * tipo de unidad y de edificio del contenido de la partida (`units/<tipo>_<equipo>`,
 * `buildings/<tipo>_<lado>`): uno sin GLB sigue con su modelo de bloques (models/).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '../assets';
import { isFriendly, type OwnerSide } from '../ui/sides';
import { toonTextured } from './toon';

/** Las animaciones que sabe pedir el juego; un modelo puede no tener alguna. */
export type UnitClip = 'idle' | 'drive' | 'fire';

/** El modelo de cada tipo de unidad: azul lo propio y aliado, rojo lo enemigo (id de units.json en minusculas). */
const UNIT_SIDES = { friendly: 'blue', enemy: 'red' } as const;
const unitFile = (unitType: string, side: keyof typeof UNIT_SIDES): string => `units/${unitType.toLowerCase()}_${UNIT_SIDES[side]}`;

/** El modelo de cada edificio: turquesa lo propio, rojo lo enemigo y gris lo de nadie (como en 2D). */
const BUILDING_SIDES = { friendly: 'blue', enemy: 'red', neutral: 'neutral' } as const;
const buildingSideOf = (side: OwnerSide): keyof typeof BUILDING_SIDES =>
  side === 'neutral' ? 'neutral' : isFriendly(side) ? 'friendly' : 'enemy';
const buildingFile = (buildingType: string, side: keyof typeof BUILDING_SIDES): string =>
  `buildings/${buildingType.toLowerCase()}_${BUILDING_SIDES[side]}`;

/** Las animaciones que se repiten (las demas suenan una vez y vuelven a 'idle'). */
const LOOPING: ReadonlySet<UnitClip> = new Set<UnitClip>(['idle', 'drive']);
const FADE_SECONDS = 0.15;
/** Cuanto mas rapido o mas despacio que el modelo va el reposo de cada copia (en tanto por uno). */
const IDLE_SPEED_SPREAD = 0.15;

interface LoadedModel {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Una malla de un modelo fijo, con donde va dentro del modelo (para copiarla muchas veces instanciada). */
export interface StaticPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
}

/** Una unidad con modelo GLB: su objeto (ya mirando hacia +z, como los de bloques) y como animarla. */
export interface GlbUnit {
  object: THREE.Group;
  /** Las animaciones que trae el modelo (sus nombres, con lo que duran en segundos). */
  clips: readonly { name: string; seconds: number }[];
  play(clip: UnitClip): void;
  update(seconds: number): void;
}

const modelUrl = (file: string): string => asset(`assets/models/${file}.glb`);

/** Pasa los materiales del GLB al cartoon del juego (con su textura pixel) y que den sombra. */
function toToon(scene: THREE.Object3D): void {
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh;
    const original = mesh.material as THREE.MeshStandardMaterial;
    if (original.map) mesh.material = toonTextured(original.map);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

/** Cada malla con su propio material (para oscurecer una unidad sin tocar las demas). */
function ownMaterials(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) (node as THREE.Mesh).material = ((node as THREE.Mesh).material as THREE.Material).clone();
  });
}

/** Los tipos de unidad y de edificio (ids del contenido) cuyo modelo se busca. */
export interface GlbTypes {
  units: readonly string[];
  buildings: readonly string[];
}

/** Un modelo cargado y pasado a la luz toon, o null si no hay (ese tipo sigue con bloques). */
async function loadModel(loader: GLTFLoader, file: string): Promise<[string, LoadedModel] | null> {
  try {
    const gltf = await loader.loadAsync(modelUrl(file));
    toToon(gltf.scene);
    return [file, { scene: gltf.scene, clips: gltf.animations }];
  } catch {
    return null;
  }
}

/** Los modelos GLB cargados, por fichero. */
export class GlbLibrary {
  private constructor(private readonly models: ReadonlyMap<string, LoadedModel>) {}

  /**
   * Carga los modelos de esos tipos de unidad y de edificio (los que tengan: el que falta se salta) y
   * los fijos que se piden (`staticFiles`, rutas dentro de assets/models). Con `fresh`, preguntando
   * al servidor si han cambiado (el playground recarga asi los modelos recien exportados).
   */
  static async load(types: GlbTypes, staticFiles: readonly string[] = [], fresh = false): Promise<GlbLibrary> {
    const loader = new GLTFLoader();
    if (fresh) loader.setRequestHeader({ 'Cache-Control': 'no-cache' });
    const unitFiles = types.units.flatMap((type) => Object.keys(UNIT_SIDES).map((side) => unitFile(type, side as keyof typeof UNIT_SIDES)));
    const buildingFiles = types.buildings.flatMap((type) =>
      Object.keys(BUILDING_SIDES).map((side) => buildingFile(type, side as keyof typeof BUILDING_SIDES)),
    );
    const files = [...unitFiles, ...buildingFiles, ...staticFiles];
    const loaded = await Promise.all(files.map((file) => loadModel(loader, file)));
    return new GlbLibrary(new Map(loaded.filter((entry): entry is [string, LoadedModel] => entry !== null)));
  }

  /** Una copia del edificio de ese tipo para ese lado, con su animacion de reposo si la tiene (null si el tipo no tiene GLB). */
  building(buildingType: string, side: OwnerSide): GlbUnit | null {
    const model = this.models.get(buildingFile(buildingType, buildingSideOf(side)));
    return model ? animatedCopy(model) : null;
  }

  /** Las mallas de un modelo fijo (vacio si no esta cargado). */
  staticParts(file: string): StaticPart[] {
    const model = this.models.get(file);
    if (!model) return [];
    model.scene.updateMatrixWorld(true);
    const parts: StaticPart[] = [];
    model.scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mesh = node as THREE.Mesh;
      parts.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, matrix: mesh.matrixWorld.clone() });
    });
    return parts;
  }

  /** Una copia animada del modelo de ese tipo para ese lado (null si el tipo no tiene GLB). */
  unit(unitType: string, side: OwnerSide): GlbUnit | null {
    const model = this.models.get(unitFile(unitType, isFriendly(side) ? 'friendly' : 'enemy'));
    return model ? animatedCopy(model) : null;
  }
}

function animatedCopy(model: LoadedModel): GlbUnit {
  const copy = model.scene.clone();
  ownMaterials(copy);
  // Ashfox mira hacia el norte (-z); las piezas del juego, hacia +z.
  copy.rotation.y = Math.PI;
  const object = new THREE.Group();
  object.add(copy);
  const mixer = new THREE.AnimationMixer(copy);
  const actions = new Map(model.clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  let current: THREE.AnimationAction | null = null;
  const play = (name: UnitClip) => {
    const next = actions.get(name);
    if (!next || next === current) return;
    next.reset().setLoop(LOOPING.has(name) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    if (current) next.crossFadeFrom(current, FADE_SECONDS, false);
    next.play();
    current = next;
  };
  mixer.addEventListener('finished', () => play('idle'));
  play('idle');
  startOutOfStep(actions.get('idle'));
  const clips = model.clips.map((clip) => ({ name: clip.name, seconds: clip.duration }));
  return { object, clips, play, update: (seconds) => mixer.update(seconds) };
}

/** Cada copia empieza su reposo en otro momento y lo lleva a su ritmo: que no se mezan todas a la vez. */
function startOutOfStep(idle: THREE.AnimationAction | undefined): void {
  if (!idle) return;
  idle.time = Math.random() * idle.getClip().duration;
  idle.timeScale = 1 + (Math.random() * 2 - 1) * IDLE_SPEED_SPREAD;
}
