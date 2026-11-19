/**
 * El terreno en 3D, con los modelos de Ashfox (tools/art/ashfox/models/terrain.mjs, a semejanza del
 * terreno 2D): cada casilla es el bloque de su clase (hierba, agua...) y, si lleva, su decorado encima
 * (arboles, cactus, flores, muñeco de nieve). Las montañas y la arena no son casillas sino relieve
 * (relief.ts): sierras, mesetas y dunas que siguen de una casilla a otra. Que lleva cada terreno lo
 * dice TERRAIN_PIECES, por id de terrain.json; uno sin entrada se ve segun lo que es (agua, esconde,
 * llano), asi cualquier contenido se puede mirar. Cada clase de casilla y de decorado es una malla
 * instanciada, y todo el relieve otra: el coste no crece con el tamaño del mapa.
 */
import * as THREE from 'three';
import type { TerrainType } from '../../../core/content';
import { elevationAt } from '../../../core/elevation';
import { terrainAt, themeOf } from '../../../core/gameContent';
import { mapGrid } from '../../../core/mapGrid';
import type { GameState, Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import type { GlbLibrary } from '../pieces/glbModels';
import { buildRelief, type ReliefStyle, type ReliefView } from './relief';
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
  /**
   * Si es relieve (montaña, meseta, dunas): su estilo. Se dibuja el relieve en vez de la casilla
   * (`tile` sigue diciendo de que suelo es), y lo que hay encima se pone en lo alto, como en 2D.
   */
  relief?: ReliefStyle;
}

/**
 * Los relieves, con sus colores por alturas y la roca
 * de sus laderas empinadas: hierba en las faldas, monte bajo, roca y nieve en las cimas mas altas.
 */
const GREEN_MOUNTAIN: ReliefStyle = {
  shape: 'peak',
  bands: [
    { from: 0, color: 0x6fae3c },
    { from: 0.3, color: 0x5c9c38 },
    { from: 0.55, color: 0x4a8532 },
    { from: 0.85, color: 0x8c8676 },
    { from: 1.2, color: 0xa8a290 },
    { from: 1.5, color: 0xf2f6ff },
  ],
  cliff: 0x77715f,
};
const SNOW_MOUNTAIN: ReliefStyle = {
  shape: 'peak',
  bands: [
    { from: 0, color: 0xdce8f4 },
    { from: 0.3, color: 0x7f8ea6 },
    { from: 0.75, color: 0x9eacc2 },
    { from: 1.15, color: 0xf4f8ff },
  ],
  cliff: 0x667590,
};
/** La meseta, a capas de roca de colores (como los estratos de un cañon). */
const MESA: ReliefStyle = {
  shape: 'mesa',
  bands: [
    { from: 0, color: 0xe3ac55 },
    { from: 0.12, color: 0xd0712c },
    { from: 0.37, color: 0xee9a48 },
    { from: 0.62, color: 0xc0602a },
    { from: 0.87, color: 0xf0b060 },
    { from: 1.12, color: 0xb4542a },
  ],
};
const DUNES: ReliefStyle = {
  shape: 'dunes',
  bands: [
    { from: 0, color: 0xe3ac55 },
    { from: 0.05, color: 0xf2c66e },
    { from: 0.11, color: 0xffe2a0 },
  ],
};

const GRASS: TerrainPiece = { tile: 'tile_grass' };
const WATER: TerrainPiece = { tile: 'tile_water' };
const WOODS: TerrainPiece = { tile: 'tile_forest', decor: ['trees'] };

const TERRAIN_PIECES: Readonly<Record<string, TerrainPiece>> = {
  Grass: GRASS,
  Flowers: { tile: 'tile_grass', decor: ['flowers_red', 'flowers_yellow', 'flowers_purple', 'flowers_mixed'] },
  Woods: WOODS,
  GrassMountain: { tile: 'tile_grass', relief: GREEN_MOUNTAIN },
  Water: WATER,
  SWater: { tile: 'tile_shallow' },
  DWater: { tile: 'tile_deep' },
  Sand: { tile: 'tile_sand', relief: DUNES },
  Cactus: { tile: 'tile_sand', relief: DUNES, decor: ['cactus'] },
  SandMountain: { tile: 'tile_sand', relief: MESA },
  Snow: { tile: 'tile_snow' },
  Frosty: { tile: 'tile_snow', decor: ['snowman'] },
  SnowMountain: { tile: 'tile_snow', relief: SNOW_MOUNTAIN },
  SnowWood: { tile: 'tile_snow', decor: ['pines'] },
  Ice: { tile: 'tile_ice' },
};

/** Lo que cambia un tema (id de themes.json): en el nevado, las montañas de hierba son nevadas (como en 2D). */
const THEME_PIECES: Readonly<Record<string, Readonly<Record<string, TerrainPiece>>>> = {
  Snowy: { GrassMountain: { tile: 'tile_snow', relief: SNOW_MOUNTAIN } },
};

/**
 * Cuantas variantes tiene cada suelo (`<casilla>_<n>`: los mismos colores con otros detalles, ver
 * tools/art/ashfox/models/terrain.mjs). Cada casilla elige una y un giro: asi no se ven todas iguales.
 */
const TILE_VARIANTS: Readonly<Partial<Record<TileModel, number>>> = { tile_grass: 4, tile_forest: 3, tile_snow: 3 };

const variantFiles = (tile: TileModel): string[] => {
  const count = TILE_VARIANTS[tile];
  return count ? Array.from({ length: count }, (_, index) => `${tile}_${index}`) : [tile];
};

/** Los modelos que hay que cargar (rutas dentro de assets/models): las casillas que no son relieve y los decorados. */
export const TERRAIN_MODEL_FILES: readonly string[] = [
  ...new Set(Object.values(TERRAIN_PIECES).flatMap((piece) => [...(piece.relief ? [] : variantFiles(piece.tile)), ...(piece.decor ?? [])])),
].map((model) => `terrain/${model}`);

/** Las casillas en la niebla: mas oscuras y algo azuladas (como de noche), sin dejar de leerse. */
const FOG_TINT = new THREE.Color(0.52, 0.56, 0.72);
const SEEN = new THREE.Color(1, 1, 1);
/** Lo que se desplaza el decorado en su casilla, para que no parezca copiado. */
const DECOR_JITTER = 0.12;
/**
 * El tamaño del decorado (arboles, flores, cactus...) respecto a su modelo: algo mas pequeño, para que
 * tape menos las unidades y las casillas de alrededor (docs/ESTETICA.md, "Tamaños en el tablero").
 */
const DECOR_SIZE = new THREE.Vector3(0.82, 0.82, 0.82);

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
  /** Las casillas de arena (de ahi sale el polvo que levanta el viento). */
  readonly sandTiles: readonly Pos[];
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

/** Un giro de un cuarto de vuelta (0 a 3) que sale siempre igual para la misma casilla. */
const quarterTurn = (pos: Pos, salt: number): THREE.Quaternion =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.floor(tileNoise(pos, salt) * 4) * (Math.PI / 2));

/** Donde va una casilla, girada (los suelos son cuadrados: girarlos los varia sin que se note el corte). */
const tilePlace = (pos: Pos, lift: number): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(pos.x, lift, pos.y), quarterTurn(pos, 5), new THREE.Vector3(1, 1, 1));

/** Lo que sube cada nivel de altura (regla de elevacion, core/elevation.ts), en casillas. */
const LEVEL_HEIGHT = 0.3;
const liftOf = (s: GameState, pos: Pos): number => elevationAt(s, pos) * LEVEL_HEIGHT;

/**
 * Donde va cada casilla y, debajo de las altas, una copia por nivel: rellenan el desnivel y en el
 * borde del mapa y frente a lo mas bajo se ven como terrazas (la capa de arriba de cada copia, con
 * su borde de hierba o arena). Cada sitio lleva su casilla (para la niebla).
 */
function stackedPlaces(s: GameState, positions: readonly Pos[]): { positions: Pos[]; places: THREE.Matrix4[] } {
  const stacked = positions.flatMap((pos) => Array.from({ length: elevationAt(s, pos) + 1 }, (_, below) => ({ pos, below })));
  return {
    positions: stacked.map(({ pos }) => pos),
    places: stacked.map(({ pos, below }) => tilePlace(pos, liftOf(s, pos) - below * LEVEL_HEIGHT)),
  };
}

/** El modelo de la casilla: su clase y, si tiene variantes, una (siempre la misma). */
function tileFile(s: GameState, pos: Pos): string {
  const files = variantFiles(pieceAt(s, pos).tile);
  return files[Math.floor(tileNoise(pos, 6) * files.length)]!;
}

/** Donde va el decorado de una casilla: encima, algo movido y girado (siempre igual para la misma casilla). */
function decorPlace(pos: Pos, top: number): THREE.Matrix4 {
  const shift = (salt: number) => (tileNoise(pos, salt) - 0.5) * DECOR_JITTER;
  const at = new THREE.Vector3(pos.x + shift(1), top, pos.y + shift(2));
  return new THREE.Matrix4().compose(at, quarterTurn(pos, 3), DECOR_SIZE);
}

/** Las casillas de cada clase de modelo; las de agua, con el agua que se mueve (water.ts). */
function tileMeshes(library: GlbLibrary, s: GameState, byFile: ReadonlyMap<string, Pos[]>): PlacedMesh[] {
  return [...byFile].flatMap(([file, tilePositions]) => {
    const { positions, places } = stackedPlaces(s, tilePositions);
    const placed = instanced(library, file, positions, places);
    if (MOVING_WATER.has(pieceAt(s, positions[0]!).tile)) for (const { mesh } of placed) makeWater(mesh, s, positions);
    return placed;
  });
}

/** Le pone a las casillas de agua su material que se mueve y, a cada copia, sus orillas. */
function makeWater(mesh: THREE.InstancedMesh, s: GameState, positions: readonly Pos[]): void {
  mesh.material = waterMaterial(mesh.material as THREE.Material);
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.setAttribute('aShore', shoreSides(s, positions));
}

/** El decorado de cada clase (cada casilla con varios posibles elige uno, siempre el mismo), encima de `heightOf`. */
function decorMeshes(library: GlbLibrary, s: GameState, positions: readonly Pos[], heightOf: (pos: Pos) => number): PlacedMesh[] {
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
      at.map((pos) => decorPlace(pos, heightOf(pos))),
    ),
  );
}

function shade(placed: readonly PlacedMesh[], seen: Grid<boolean>): void {
  for (const { mesh, positions } of placed) {
    positions.forEach((pos, index) => mesh.setColorAt(index, seen.at(pos) ? SEEN : FOG_TINT));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/** El relieve con niebla: cada columna con su color, oscurecida si su casilla no se ve. */
function shadeRelief(relief: ReliefView, seen: Grid<boolean>): void {
  relief.tileOfColumn.forEach((pos, index) => {
    const color = relief.baseColors[index]!.clone();
    relief.mesh.setColorAt(index, seen.at(pos) ? color : color.multiply(FOG_TINT));
  });
  if (relief.mesh.instanceColor) relief.mesh.instanceColor.needsUpdate = true;
}

/** El relieve del mapa: sus casillas, el suelo de cada una (el de su clase, subido por la elevacion) y por donde pueden salirse las faldas. */
function reliefOf(s: GameState, positions: readonly Pos[]): ReliefView {
  const tiles = positions.flatMap((pos) => {
    const relief = pieceAt(s, pos).relief;
    return relief ? [{ pos, style: relief }] : [];
  });
  const grid = mapGrid(s);
  return buildRelief({
    width: grid.width,
    height: grid.height,
    tiles,
    groundAt: (pos) => tileTop(pieceAt(s, pos).tile) + liftOf(s, pos),
    canSpill: (pos) => !terrainAt(s, pos).isWater,
  });
}

export function buildTerrain(s: GameState, library: GlbLibrary): TerrainView {
  const grid = mapGrid(s);
  const positions = [...grid.cells()].map((cell) => cell.pos);
  const relief = reliefOf(s, positions);
  const flat = positions.filter((pos) => !pieceAt(s, pos).relief);
  const tiles = tileMeshes(
    library,
    s,
    groupBy(flat, (pos) => tileFile(s, pos)),
  );
  const heights = grid.createLayer(0);
  for (const pos of positions)
    heights.set(pos, pieceAt(s, pos).relief ? relief.topAt(pos) : tileTop(pieceAt(s, pos).tile) + liftOf(s, pos));
  const decor = decorMeshes(library, s, positions, (pos) => heights.at(pos));
  const object = new THREE.Group();
  object.add(relief.mesh, ...[...tiles, ...decor].map((placed) => placed.mesh));
  const placedOf = new Map(tiles.map((placed) => [placed.mesh as THREE.Object3D, placed]));
  const tileOfHit = (hit: THREE.Intersection): Pos | null => {
    if (hit.instanceId === undefined) return null;
    if (hit.object === relief.mesh) return relief.tileOfColumn[hit.instanceId] ?? null;
    return placedOf.get(hit.object)?.positions[hit.instanceId] ?? null;
  };
  return {
    object,
    pickables: [relief.mesh, ...tiles.map((placed) => placed.mesh)],
    tileOfHit,
    heightAt: (pos) => heights.at(pos),
    showSeen: (seen) => {
      shade([...tiles, ...decor], seen);
      shadeRelief(relief, seen);
    },
    update: (seconds) => {
      waterClock.value += seconds;
    },
    sandTiles: positions.filter((pos) => pieceAt(s, pos).tile === 'tile_sand'),
  };
}
