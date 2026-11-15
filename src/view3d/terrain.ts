/**
 * El terreno en 3D: cada casilla es un bloque de la altura y el color de su terreno (TERRAIN_LOOKS,
 * por id de terrain.json), con su decorado encima (arboles, cactus, flores). Todas las casillas son
 * una sola malla instanciada y cada decorado otra, asi el coste no crece con el tamaño del mapa.
 * Un terreno sin aspecto propio se ve segun lo que es (agua, esconde, llano): cualquier contenido se
 * puede mirar.
 */
import * as THREE from 'three';
import type { GameState, Pos } from '../core/model';
import { mapGrid } from '../core/mapGrid';
import { terrainAt } from '../core/gameContent';
import type { TerrainType } from '../core/content';
import type { Grid } from '../core/util/grid';
import type { BlockModel, TeamPaint } from './blocks';
import { instancedModel } from './instancedBlocks';
import { toonMaterial } from './toon';
import { tileToWorld } from './space';

type DecorKind = 'tree' | 'pine' | 'cactus' | 'flowers';

interface TerrainLook {
  color: number;
  /** Altura de la cara de arriba (donde se pone lo que hay en la casilla). */
  height: number;
  decor?: DecorKind;
}

const PLAIN_LOOK: TerrainLook = { color: 0x8fd16a, height: 0.2 };
const WATER_LOOK: TerrainLook = { color: 0x3fa7e0, height: 0.04 };
const WOODS_LOOK: TerrainLook = { color: 0x6fbf55, height: 0.22, decor: 'tree' };

const TERRAIN_LOOKS: Readonly<Record<string, TerrainLook>> = {
  Grass: PLAIN_LOOK,
  Flowers: { color: 0x98d873, height: 0.2, decor: 'flowers' },
  Woods: WOODS_LOOK,
  GrassCliff: { color: 0x7cb85c, height: 0.75 },
  Water: WATER_LOOK,
  SWater: { color: 0x67c6e8, height: 0.08 },
  DWater: { color: 0x2f7fc4, height: 0.0 },
  Sand: { color: 0xf0d58c, height: 0.18 },
  Cactus: { color: 0xeccb7a, height: 0.18, decor: 'cactus' },
  SandCliff: { color: 0xd9b56a, height: 0.75 },
  Snow: { color: 0xeef3f8, height: 0.22 },
  Frosty: { color: 0xd6e6ef, height: 0.2 },
  SnowCliff: { color: 0xcfdbe6, height: 0.8 },
  SnowWood: { color: 0xe3ecf3, height: 0.22, decor: 'pine' },
  Ice: { color: 0xb8e4f2, height: 0.1 },
};

/** Lo que no tiene aspecto propio se ve como lo que es. */
function fallbackLook(terrain: TerrainType): TerrainLook {
  if (terrain.isWater) return WATER_LOOK;
  return terrain.hides ? WOODS_LOOK : PLAIN_LOOK;
}

const lookOf = (terrain: TerrainType): TerrainLook => TERRAIN_LOOKS[terrain.id] ?? fallbackLook(terrain);

const DECOR_MODELS: Readonly<Record<DecorKind, BlockModel>> = {
  tree: {
    blocks: [
      { size: [0.12, 0.25, 0.12], at: [0, 0, 0], paint: 'wood' },
      { size: [0.42, 0.26, 0.42], at: [0, 0.22, 0], paint: 'leafDark' },
      { size: [0.28, 0.2, 0.28], at: [0, 0.46, 0], paint: 'leaf' },
    ],
  },
  pine: {
    blocks: [
      { size: [0.1, 0.18, 0.1], at: [0, 0, 0], paint: 'wood' },
      { size: [0.4, 0.2, 0.4], at: [0, 0.16, 0], paint: 'pine' },
      { size: [0.28, 0.2, 0.28], at: [0, 0.34, 0], paint: 'pine' },
      { size: [0.16, 0.14, 0.16], at: [0, 0.52, 0], paint: 'snow' },
    ],
  },
  cactus: {
    blocks: [
      { size: [0.12, 0.42, 0.12], at: [0, 0, 0], paint: 'cactus' },
      { size: [0.18, 0.07, 0.07], at: [0.12, 0.16, 0], paint: 'cactus' },
      { size: [0.07, 0.14, 0.07], at: [0.18, 0.2, 0], paint: 'cactus' },
    ],
  },
  flowers: {
    blocks: [
      { size: [0.08, 0.06, 0.08], at: [-0.2, 0, 0.15], paint: 'petal' },
      { size: [0.08, 0.06, 0.08], at: [0.18, 0, -0.1], paint: 'light' },
      { size: [0.08, 0.06, 0.08], at: [0.05, 0, 0.25], paint: 'petal' },
    ],
  },
};
const DECOR_KINDS = Object.keys(DECOR_MODELS) as DecorKind[];

/** El decorado no es de nadie: su modelo no usa los colores de equipo. */
const NO_TEAM: TeamPaint = { team: 0xffffff, teamDark: 0xffffff };

/** Hasta donde bajan los bloques del terreno: se ven sus lados en los bordes y en los cortados. */
const TERRAIN_BOTTOM = -0.5;
/** Las casillas en la niebla: mas oscuras y algo azuladas (como de noche), sin dejar de leerse. */
const FOG_TINT = new THREE.Color(0.52, 0.56, 0.72);
/** Cuanto cambia el tono de una casilla a otra (en ajedrezado), para que se lea la cuadricula. */
const CHECKER_SHADE = 0.05;
/** Lo que se desplaza y gira el decorado en su casilla, para que no parezca copiado. */
const DECOR_JITTER = 0.18;

/** El terreno ya construido: su objeto 3D y lo que preguntan los demas (alturas, que casilla se toca). */
export interface TerrainView {
  readonly object: THREE.Group;
  /** La malla de las casillas (para saber que casilla se toca: su `instanceId`). */
  readonly tiles: THREE.InstancedMesh;
  /** La casilla de cada copia de `tiles`, por su numero. */
  readonly tileOfInstance: readonly Pos[];
  heightAt(pos: Pos): number;
  /** Oscurece las casillas que no se ven (la niebla) y aclara las que si. */
  showSeen(seen: Grid<boolean>): void;
}

/** Un numero entre 0 y 1 que sale siempre igual para la misma casilla (para variar sin azar). */
function tileNoise(pos: Pos, salt: number): number {
  const value = Math.sin(pos.x * 127.1 + pos.y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function tileMatrix(pos: Pos, height: number): THREE.Matrix4 {
  const depth = height - TERRAIN_BOTTOM;
  const center = tileToWorld(pos, TERRAIN_BOTTOM + depth / 2);
  return new THREE.Matrix4().compose(center, new THREE.Quaternion(), new THREE.Vector3(1, depth, 1));
}

function tileColor(pos: Pos, look: TerrainLook): THREE.Color {
  const isDarkSquare = (pos.x + pos.y) % 2 === 1;
  return new THREE.Color(look.color).multiplyScalar(isDarkSquare ? 1 - CHECKER_SHADE : 1);
}

function decorMatrix(pos: Pos, height: number): THREE.Matrix4 {
  const shift = (salt: number) => (tileNoise(pos, salt) - 0.5) * DECOR_JITTER;
  const at = tileToWorld(pos, height).add(new THREE.Vector3(shift(1), 0, shift(2)));
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tileNoise(pos, 3) * Math.PI * 2);
  return new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1));
}

/** Las casillas, todas en una malla instanciada (cada una con su altura y su color). */
function tilesMesh(s: GameState, positions: readonly Pos[]): THREE.InstancedMesh {
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial(0xffffff), positions.length);
  positions.forEach((pos, index) => {
    const look = lookOf(terrainAt(s, pos));
    tiles.setMatrixAt(index, tileMatrix(pos, look.height));
    tiles.setColorAt(index, tileColor(pos, look));
  });
  tiles.receiveShadow = true;
  return tiles;
}

/** El decorado de todo el mapa: un grupo instanciado por clase de decorado. */
function decorObjects(s: GameState, positions: readonly Pos[]): THREE.Group[] {
  return DECOR_KINDS.map((kind) => {
    const places = positions
      .map((pos) => ({ pos, look: lookOf(terrainAt(s, pos)) }))
      .filter(({ look }) => look.decor === kind)
      .map(({ pos, look }) => decorMatrix(pos, look.height));
    return instancedModel(DECOR_MODELS[kind], NO_TEAM, places);
  });
}

/** Pinta cada casilla con su color, oscurecido si la niebla la tapa. */
function shadeTiles(s: GameState, tiles: THREE.InstancedMesh, positions: readonly Pos[], seen: Grid<boolean>): void {
  positions.forEach((pos, index) => {
    const color = tileColor(pos, lookOf(terrainAt(s, pos)));
    tiles.setColorAt(index, seen.at(pos) ? color : color.multiply(FOG_TINT));
  });
  if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
}

export function buildTerrain(s: GameState): TerrainView {
  const grid = mapGrid(s);
  const positions = [...grid.cells()].map((cell) => cell.pos);
  const tiles = tilesMesh(s, positions);
  const object = new THREE.Group();
  object.add(tiles, ...decorObjects(s, positions));
  const heights = grid.createLayer(0);
  for (const pos of positions) heights.set(pos, lookOf(terrainAt(s, pos)).height);
  return {
    object,
    tiles,
    tileOfInstance: positions,
    heightAt: (pos) => heights.at(pos),
    showSeen: (seen) => shadeTiles(s, tiles, positions, seen),
  };
}
