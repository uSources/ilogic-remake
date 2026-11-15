/**
 * El terreno en 3D, con los modelos de Ashfox (tools/art/ashfox/models/terrain.mjs, a semejanza del
 * terreno 2D): cada casilla es el bloque de su clase (hierba, arena, agua...) y, si lleva, su decorado
 * encima (arboles, montaña, cactus, flores, muñeco de nieve). Que lleva cada terreno lo dice
 * TERRAIN_PIECES, por id de terrain.json; uno sin entrada se ve segun lo que es (agua, esconde,
 * llano), asi cualquier contenido se puede mirar. Cada clase de casilla y de decorado es una malla
 * instanciada: el coste no crece con el tamaño del mapa.
 */
import * as THREE from 'three';
import type { TerrainType } from '../core/content';
import { terrainAt, themeOf } from '../core/gameContent';
import { mapGrid } from '../core/mapGrid';
import type { GameState, Pos } from '../core/model';
import type { Grid } from '../core/util/grid';
import type { GlbLibrary } from './glbModels';
import { shoreSides, waterClock, waterMaterial } from './water';

/** Las casillas de Ashfox y la altura de su cara de arriba (en unidades de Ashfox: 16 = una casilla). */
const TILE_TOPS = {
  tile_grass: 4,
  tile_forest: 4,
  tile_sand: 4,
  tile_snow: 4,
  tile_water: 1,
  tile_deep: 0,
  tile_shallow: 2,
  tile_ice: 2,
} as const;
type TileModel = keyof typeof TILE_TOPS;
const ASHFOX_UNITS_PER_TILE = 16;

interface TerrainPiece {
  tile: TileModel;
  /** El decorado de encima; con varios, cada casilla elige uno (siempre el mismo). */
  decor?: readonly string[];
}

const GRASS: TerrainPiece = { tile: 'tile_grass' };
const WATER: TerrainPiece = { tile: 'tile_water' };
const WOODS: TerrainPiece = { tile: 'tile_forest', decor: ['trees'] };

const TERRAIN_PIECES: Readonly<Record<string, TerrainPiece>> = {
  Grass: GRASS,
  Flowers: { tile: 'tile_grass', decor: ['flowers_red', 'flowers_yellow', 'flowers_purple'] },
  Woods: WOODS,
  GrassCliff: { tile: 'tile_grass', decor: ['mount_grass'] },
  Water: WATER,
  SWater: { tile: 'tile_shallow' },
  DWater: { tile: 'tile_deep' },
  Sand: { tile: 'tile_sand' },
  Cactus: { tile: 'tile_sand', decor: ['cactus'] },
  SandCliff: { tile: 'tile_sand', decor: ['mount_mesa'] },
  Snow: { tile: 'tile_snow' },
  Frosty: { tile: 'tile_snow', decor: ['snowman'] },
  SnowCliff: { tile: 'tile_snow', decor: ['mount_snow'] },
  SnowWood: { tile: 'tile_snow', decor: ['pines'] },
  Ice: { tile: 'tile_ice' },
};

/** Lo que cambia un tema (id de themes.json): en el nevado, las montañas de hierba son nevadas (como en 2D). */
const THEME_PIECES: Readonly<Record<string, Readonly<Record<string, TerrainPiece>>>> = {
  Snowy: { GrassCliff: { tile: 'tile_snow', decor: ['mount_snow'] } },
};

/** Los modelos que hay que cargar (rutas dentro de assets/models). */
export const TERRAIN_MODEL_FILES: readonly string[] = [
  ...new Set(Object.values(TERRAIN_PIECES).flatMap((piece) => [piece.tile, ...(piece.decor ?? [])])),
].map((model) => `terrain/${model}`);

/** Las casillas en la niebla: mas oscuras y algo azuladas (como de noche), sin dejar de leerse. */
const FOG_TINT = new THREE.Color(0.52, 0.56, 0.72);
const SEEN = new THREE.Color(1, 1, 1);
/** Lo que se desplaza el decorado en su casilla, para que no parezca copiado. */
const DECOR_JITTER = 0.12;

/** Lo que no tiene pieza propia se ve como lo que es. */
function fallbackPiece(terrain: TerrainType): TerrainPiece {
  if (terrain.isWater) return WATER;
  return terrain.hides ? WOODS : GRASS;
}

function pieceAt(s: GameState, pos: Pos): TerrainPiece {
  const terrain = terrainAt(s, pos);
  return THEME_PIECES[themeOf(s).id]?.[terrain.id] ?? TERRAIN_PIECES[terrain.id] ?? fallbackPiece(terrain);
}

/** Las casillas de agua que se mueven (el hielo no). */
const MOVING_WATER: ReadonlySet<TileModel> = new Set<TileModel>(['tile_water', 'tile_deep', 'tile_shallow']);

const tileTop = (tile: TileModel): number => TILE_TOPS[tile] / ASHFOX_UNITS_PER_TILE;

/** Un numero entre 0 y 1 que sale siempre igual para la misma casilla (para variar sin azar). */
function tileNoise(pos: Pos, salt: number): number {
  const value = Math.sin(pos.x * 127.1 + pos.y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Una malla instanciada con las casillas a las que pertenece cada copia (para la niebla y para tocar). */
interface PlacedMesh {
  mesh: THREE.InstancedMesh;
  positions: readonly Pos[];
}

/** El terreno ya construido: su objeto 3D y lo que preguntan los demas (alturas, que casilla se toca). */
export interface TerrainView {
  readonly object: THREE.Group;
  /** Lo que se puede tocar (las casillas). */
  readonly pickables: readonly THREE.Object3D[];
  /** La casilla de un toque sobre `pickables` (null si no es una casilla). */
  tileOfHit(hit: THREE.Intersection): Pos | null;
  heightAt(pos: Pos): number;
  /** Oscurece lo que no se ve (la niebla) y aclara lo que si. */
  showSeen(seen: Grid<boolean>): void;
  /** Lo que se mueve solo (el agua). */
  update(seconds: number): void;
}

/** Copias de un modelo de Ashfox, una por sitio (`places`: donde va y como gira cada una). */
function instanced(library: GlbLibrary, file: string, positions: readonly Pos[], places: readonly THREE.Matrix4[]): PlacedMesh[] {
  return library.staticParts(`terrain/${file}`).map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
    places.forEach((place, index) => {
      mesh.setMatrixAt(index, place.clone().multiply(part.matrix));
      mesh.setColorAt(index, SEEN);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, positions };
  });
}

/** Las casillas agrupadas por lo que dice `keyOf` (en el orden en que salen). */
function groupBy<K>(positions: readonly Pos[], keyOf: (pos: Pos) => K): Map<K, Pos[]> {
  const groups = new Map<K, Pos[]>();
  for (const pos of positions) {
    const key = keyOf(pos);
    const group = groups.get(key) ?? [];
    group.push(pos);
    groups.set(key, group);
  }
  return groups;
}

const tilePlace = (pos: Pos): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(pos.x, 0, pos.y);

/** Donde va el decorado de una casilla: encima, algo movido y girado (siempre igual para la misma casilla). */
function decorPlace(pos: Pos, top: number): THREE.Matrix4 {
  const shift = (salt: number) => (tileNoise(pos, salt) - 0.5) * DECOR_JITTER;
  const at = new THREE.Vector3(pos.x + shift(1), top, pos.y + shift(2));
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(tileNoise(pos, 3) * 4) * (Math.PI / 2));
  return new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1));
}

/** Las casillas de cada clase de modelo; las de agua, con el agua que se mueve (water.ts). */
function tileMeshes(library: GlbLibrary, s: GameState, byTile: ReadonlyMap<TileModel, Pos[]>): PlacedMesh[] {
  return [...byTile].flatMap(([tile, positions]) => {
    const placed = instanced(library, tile, positions, positions.map(tilePlace));
    if (MOVING_WATER.has(tile)) for (const { mesh } of placed) makeWater(mesh, s, positions);
    return placed;
  });
}

/** Le pone a las casillas de agua su material que se mueve y, a cada copia, sus orillas. */
function makeWater(mesh: THREE.InstancedMesh, s: GameState, positions: readonly Pos[]): void {
  mesh.material = waterMaterial(mesh.material as THREE.Material);
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aShore', shoreSides(s, positions));
}

/** El decorado de cada clase (cada casilla con varios posibles elige uno, siempre el mismo). */
function decorMeshes(library: GlbLibrary, s: GameState, positions: readonly Pos[]): PlacedMesh[] {
  const decorated = positions.filter((pos) => pieceAt(s, pos).decor?.length);
  const byDecor = groupBy(decorated, (pos) => {
    const variants = pieceAt(s, pos).decor!;
    return variants[Math.floor(tileNoise(pos, 4) * variants.length)]!;
  });
  return [...byDecor].flatMap(([decor, at]) =>
    instanced(
      library,
      decor,
      at,
      at.map((pos) => decorPlace(pos, tileTop(pieceAt(s, pos).tile))),
    ),
  );
}

function shade(placed: readonly PlacedMesh[], seen: Grid<boolean>): void {
  for (const { mesh, positions } of placed) {
    positions.forEach((pos, index) => mesh.setColorAt(index, seen.at(pos) ? SEEN : FOG_TINT));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

export function buildTerrain(s: GameState, library: GlbLibrary): TerrainView {
  const grid = mapGrid(s);
  const positions = [...grid.cells()].map((cell) => cell.pos);
  const byTile = groupBy(positions, (pos) => pieceAt(s, pos).tile);
  const tiles = tileMeshes(library, s, byTile);
  const decor = decorMeshes(library, s, positions);
  const object = new THREE.Group();
  object.add(...[...tiles, ...decor].map((placed) => placed.mesh));
  const heights = grid.createLayer(0);
  for (const pos of positions) heights.set(pos, tileTop(pieceAt(s, pos).tile));
  const placedOf = new Map(tiles.map((placed) => [placed.mesh as THREE.Object3D, placed]));
  return {
    object,
    pickables: tiles.map((placed) => placed.mesh),
    tileOfHit: (hit) => (hit.instanceId === undefined ? null : (placedOf.get(hit.object)?.positions[hit.instanceId] ?? null)),
    heightAt: (pos) => heights.at(pos),
    showSeen: (seen) => shade([...tiles, ...decor], seen),
    update: (seconds) => {
      waterClock.value += seconds;
    },
  };
}
