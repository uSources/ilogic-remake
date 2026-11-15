/**
 * Modelos GLB hechos con Ashfox (fuentes en tools/art/ashfox, salida en public/assets/models): los
 * de las unidades que ya tienen uno, animados ('idle', 'drive', 'fire'; cada unidad lleva su copia),
 * y los fijos del terreno (casillas y decorado), que se dibujan instanciados (`staticParts`). Un tipo
 * de unidad sin GLB sigue con su modelo de bloques (models/), asi se pueden ir pasando una a una.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { asset } from '../assets';
import { isFriendly, type OwnerSide } from '../ui/sides';
import { toonTextured } from './toon';

/** Las animaciones que sabe pedir el juego; un modelo puede no tener alguna. */
export type UnitClip = 'idle' | 'drive' | 'fire';

/** El fichero de cada tipo de unidad (id de units.json), en azul (lo propio y aliado) y en rojo (lo enemigo). */
const GLB_UNITS: Readonly<Record<string, { friendly: string; enemy: string }>> = {
  Tank: { friendly: 'tank_blue', enemy: 'tank_red' },
};

/** Los edificios con modelo de Ashfox (id de buildings.json): uno por lado en assets/models/buildings. */
const GLB_BUILDINGS: readonly string[] = ['Base', 'City', 'Factory', 'Oil', 'Stronghold', 'Airport'];
const BUILDING_SIDES = { friendly: 'blue', enemy: 'red', neutral: 'neutral' } as const;
const buildingSideOf = (side: OwnerSide): keyof typeof BUILDING_SIDES =>
  side === 'neutral' ? 'neutral' : isFriendly(side) ? 'friendly' : 'enemy';
const buildingFile = (buildingType: string, side: keyof typeof BUILDING_SIDES): string =>
  `buildings/${buildingType.toLowerCase()}_${BUILDING_SIDES[side]}`;

/** Las animaciones que se repiten (las demas suenan una vez y vuelven a 'idle'). */
const LOOPING: ReadonlySet<UnitClip> = new Set<UnitClip>(['idle', 'drive']);
const FADE_SECONDS = 0.15;

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

/** Los modelos GLB cargados, por fichero. */
export class GlbLibrary {
  private constructor(private readonly models: ReadonlyMap<string, LoadedModel>) {}

  /** Carga los de las unidades y los fijos que se piden (`staticFiles`, rutas dentro de assets/models). */
  static async load(staticFiles: readonly string[] = []): Promise<GlbLibrary> {
    const loader = new GLTFLoader();
    const unitFiles = Object.values(GLB_UNITS).flatMap((sides) => [sides.friendly, sides.enemy]);
    const buildingFiles = GLB_BUILDINGS.flatMap((type) =>
      Object.keys(BUILDING_SIDES).map((side) => buildingFile(type, side as keyof typeof BUILDING_SIDES)),
    );
    const files = [...unitFiles, ...buildingFiles, ...staticFiles];
    const loaded = await Promise.all(
      files.map(async (file) => {
        const gltf = await loader.loadAsync(modelUrl(file));
        toToon(gltf.scene);
        return [file, { scene: gltf.scene, clips: gltf.animations }] as const;
      }),
    );
    return new GlbLibrary(new Map(loaded));
  }

  /** Una copia del edificio de ese tipo para ese lado, mirando hacia +z (null si el tipo no tiene GLB). */
  building(buildingType: string, side: OwnerSide): THREE.Group | null {
    const model = this.models.get(buildingFile(buildingType, buildingSideOf(side)));
    if (!model) return null;
    const copy = model.scene.clone();
    copy.rotation.y = Math.PI;
    const object = new THREE.Group();
    object.add(copy);
    return object;
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
    const files = GLB_UNITS[unitType];
    const model = files && this.models.get(isFriendly(side) ? files.friendly : files.enemy);
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
  return { object, play, update: (seconds) => mixer.update(seconds) };
}
