import type Phaser from 'phaser';
import { TerrainType, THEME_NAMES } from '../core/content';
import { mapGrid } from '../core/mapGrid';
import type { GameState, Pos } from '../core/model';
import { buildingAt } from '../core/rules';
import { Grid } from '../core/util/grid';
import { hasImage, imageFrame } from '../atlas';
import { TILE } from '../layout';
import { WANG_SETS } from './wangSets';
import { BLOB_SETS } from './blobSets';
import { ORG_SHEETS, SHEET_COLS, SHORE_ROWS, WATER_ROWS } from './sheets';

/**
 * Terreno nuevo (piezas Wang de PixelLab) en "rejilla doble": cada pieza se dibuja centrada en
 * la esquina comun de cuatro casillas, y sus cuatro esquinas son esas casillas. Asi las orillas
 * y los bordes del bosque pasan por el medio de las casillas y encajan solos.
 *
 * Capas de abajo arriba:
 *  1. Suelo por niveles: agua profunda < agua < agua poco profunda (o hielo) < tierra
 *     (hierba, arena o nieve segun el tema del mapa).
 *  2. Encima: bosque y montaña (piezas recortadas, con el suelo transparente).
 *  3. Decorados sueltos: flores, cactus y muñeco de nieve.
 */

/** Niveles del suelo, de abajo arriba. Desde LAND es tierra; por debajo, agua. */
const DEEP = 0;
const WATER = 1;
/** Agua poco profunda o hielo. */
const SHALLOW = 2;
const LAND = 3;
// Nivel de cada terreno, por su numero: 0 Grass, 1 Water, 2 Woods, 3 Sand, 4 Cactus, 5 SandCliff,
// 6 Flowers, 7 GrassCliff, 8 SWater, 9 DWater, 10 Snow, 11 Frosty, 12 SnowCliff, 13 SnowWood, 14 Ice
const LEVEL = [LAND, WATER, LAND, LAND, LAND, LAND, LAND, LAND, SHALLOW, DEEP, LAND, LAND, LAND, LAND, SHALLOW];
const groundLevel = (terrain: number): number => LEVEL[terrain]!;
const isLandTerrain = (terrain: number): boolean => groundLevel(terrain) >= LAND;
/** Temas de mapa con suelo propio (el resto, hierba). */
const DESERT = THEME_NAMES.indexOf('Desert');
const SNOWY = THEME_NAMES.indexOf('Snowy');
/** Decorados sueltos y cuantas variantes hay de cada uno. */
const DECOR: Record<number, [string, number]> = {
  [TerrainType.FLOWERS]: ['wang/decor_flowers', 3],
  [TerrainType.CACTUS]: ['wang/decor_cactus', 3],
  [TerrainType.FROSTY]: ['wang/decor_frosty', 3],
};
const FORESTS: number[] = [TerrainType.WOODS, TerrainType.SNOW_WOOD];

/** Numero fijo por casilla (la misma variante cada vez que se dibuja el mapa). */
const cellHash = (pos: Pos): number => ((pos.x * 73856093) ^ (pos.y * 19349663)) >>> 0;
/** La casilla a (dx, dy) de `pos`. */
const offset = (pos: Pos, dx: number, dy: number): Pos => ({ x: pos.x + dx, y: pos.y + dy });

/**
 * Mascara de costa de una casilla de agua segun sus vecinos de tierra (`isLandAt(dx, dy)`): lados
 * N1 E2 S4 W8 y esquinas NE16 SE32 SW64 NW128 (solo si no hay tierra en los dos lados de esa esquina).
 * Es la de las laminas blob (BLOB_SETS[set].water) y la de la espuma animada (SHORE_ROWS).
 */
function coastMask(isLandAt: (dx: number, dy: number) => boolean): number {
  const north = isLandAt(0, -1);
  const east = isLandAt(1, 0);
  const south = isLandAt(0, 1);
  const west = isLandAt(-1, 0);
  let mask = (north ? 1 : 0) | (east ? 2 : 0) | (south ? 4 : 0) | (west ? 8 : 0);
  if (!north && !east && isLandAt(1, -1)) mask |= 16;
  if (!south && !east && isLandAt(1, 1)) mask |= 32;
  if (!south && !west && isLandAt(-1, 1)) mask |= 64;
  if (!north && !west && isLandAt(-1, -1)) mask |= 128;
  return mask;
}
const decorKeys = (): string[] =>
  Object.values(DECOR).flatMap(([base, variants]) => Array.from({ length: variants }, (_, i) => `${base}_${i}`));

/** Juegos de piezas del suelo por nivel: agua profunda, agua (o hielo) y tierra del tema. */
function groundSets(theme: number): [deep: string, water: string, land: string] {
  const isSnowy = theme === SNOWY;
  const land = theme === DESERT ? 'ts_shallow_sand' : isSnowy ? 'ts_ice_snow' : 'ts_shallow_grass';
  return ['ts_deep_water', isSnowy ? 'ts_water_ice' : 'ts_water_shallow2', land];
}

/** Juegos Wang de bosque del tema y que terrenos cubre cada uno. */
function overlaySets(theme: number): { set: string; cells: number[] }[] {
  const isSnowy = theme === SNOWY;
  return [
    { set: isSnowy ? 'ts_snow_forest' : 'ts_grass_forest', cells: isSnowy ? FORESTS : [TerrainType.WOODS] },
    ...(isSnowy ? [] : [{ set: 'ts_snow_forest', cells: [TerrainType.SNOW_WOOD] }]),
  ];
}

/** Todas las imagenes que hacen falta (para saber si se puede usar el terreno nuevo). */
export function terrainArtKeys(): string[] {
  return [...Object.keys(WANG_SETS).map((set) => `wang/${set}`), ...decorKeys()];
}

/**
 * Todo lo que el terreno nuevo coloca: laminas Wang, decorados, costas, agua organica, niebla,
 * olas, espuma y sprites de montaña y bosque (con su primer plano). Lo comprueba npm run assets.
 */
export function requiredArtKeys(): string[] {
  const objs = Object.entries(OBJ_VARIANTS).flatMap(([b, n]) =>
    Array.from({ length: n }, (_, i) => [`flat/${b}_${i}`, `flat/front_${b}_${i}`]).flat(),
  );
  return [
    ...terrainArtKeys(),
    ...Object.keys(BLOB_SETS).map((k) => `blob/${k}`),
    ...Object.keys(ORG_SHEETS).map((k) => `blob/org_${k}`),
    'blob/fog',
    'anim/water',
    ...Object.keys(SHORE_ROWS).map((k) => `anim/shore_${k}`),
    ...objs,
  ];
}

export function terrainArtReady(textures: Phaser.Textures.TextureManager): boolean {
  return terrainArtKeys().every((k) => hasImage(textures, k));
}

/** El lienzo del terreno y lo que necesitan las pasadas que lo pintan. */
interface TerrainCanvas {
  readonly textures: Phaser.Textures.TextureManager;
  readonly s: GameState;
  readonly ctx: CanvasRenderingContext2D;
  /** El terreno de la partida (`mapGrid(s)`): su tamaño y sus casillas. */
  readonly map: Grid<number>;
}

/** Columnas de las laminas blob (tools/art/build_blob.py). */
const BLOB_COLS = 8;

/** Copia una casilla (TILE x TILE) de una imagen cargada al lienzo (respeta su sitio dentro del atlas). */
function drawTile(canvas: TerrainCanvas, key: string, sourceX: number, sourceY: number, x: number, y: number): void {
  const frame = imageFrame(canvas.textures, key);
  canvas.ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX + sourceX, frame.cutY + sourceY, TILE, TILE, x, y, TILE, TILE);
}

/** Copia la pieza numero `index` de una lamina de `columns` columnas en la casilla `pos`. */
function drawSheetTile(canvas: TerrainCanvas, key: string, index: number, columns: number, pos: Pos): void {
  drawTile(canvas, key, (index % columns) * TILE, Math.floor(index / columns) * TILE, pos.x * TILE, pos.y * TILE);
}

/**
 * Pieza Wang de la esquina `corner` de la rejilla doble (la de arriba a la izquierda de la casilla
 * con ese numero): que casillas de las cuatro que la rodean cuentan como "arriba" (NO 8, NE 4, SO 2,
 * SE 1). Fuera del mapa cuenta el terreno de la casilla del borde mas cercana.
 */
function wangCorners(map: Grid<number>, corner: Pos, isUp: (terrain: number) => boolean): number {
  const at = (dx: number, dy: number) => isUp(map.atClamped(offset(corner, dx, dy)));
  return (at(-1, -1) ? 8 : 0) | (at(0, -1) ? 4 : 0) | (at(-1, 0) ? 2 : 0) | (at(0, 0) ? 1 : 0);
}

/** Las esquinas de la rejilla doble: una mas que casillas en cada lado. */
const cornerGrid = (map: Grid<number>): Grid<null> => Grid.filled({ width: map.width + 1, height: map.height + 1 }, null);

/** Recorre las piezas de la rejilla doble con el juego Wang `set`; `drawEmpty`: tambien las que no tienen nada "arriba". */
function paintWangPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean, drawEmpty: boolean): void {
  const frames = WANG_SETS[set];
  if (!frames || !hasImage(canvas.textures, `wang/${set}`)) return;
  const half = TILE / 2;
  for (const { pos: corner } of cornerGrid(canvas.map).cells()) {
    const corners = wangCorners(canvas.map, corner, isUp);
    if (!corners && !drawEmpty) continue;
    drawTile(canvas, `wang/${set}`, frames[corners]! * TILE, 0, corner.x * TILE - half, corner.y * TILE - half);
  }
}

/**
 * Esquinas abiertas de una casilla de tierra (rodeada de agua por los dos lados y en diagonal):
 * NO 1, NE 2, SO 4, SE 8. `isLandAt(dx, dy)` mira al vecino.
 */
function openLandCorners(isLandAt: (dx: number, dy: number) => boolean): number {
  let corners = 0;
  if (!isLandAt(-1, 0) && !isLandAt(0, -1) && !isLandAt(-1, -1)) corners |= 1;
  if (!isLandAt(1, 0) && !isLandAt(0, -1) && !isLandAt(1, -1)) corners |= 2;
  if (!isLandAt(-1, 0) && !isLandAt(0, 1) && !isLandAt(-1, 1)) corners |= 4;
  if (!isLandAt(1, 0) && !isLandAt(0, 1) && !isLandAt(1, 1)) corners |= 8;
  return corners;
}

/** Hay algo encima que tapa la esquina (montaña, bosque o edificio): la tierra se pinta entera. */
const isCovered = (s: GameState, pos: Pos): boolean => objectBase(s, pos) !== null || buildingAt(s, pos) !== undefined;

/** Coloca las piezas de la lamina blob (tools/art/build_blob.py) segun los vecinos de cada casilla. */
function paintBlobPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean): void {
  const sheet = BLOB_SETS[set];
  const key = `blob/${set}`;
  if (!sheet || !hasImage(canvas.textures, key)) return;
  const { s, map } = canvas;
  for (const { pos, value: terrain } of map.cells()) {
    const isLand = isUp(terrain);
    // Fuera del mapa cuenta como lo de la casilla (sin orilla contra el borde).
    const isLandAt = (dx: number, dy: number) => {
      const neighbour = offset(pos, dx, dy);
      return map.contains(neighbour) ? isUp(map.at(neighbour)) : isLand;
    };
    if (isLand) {
      const corners = isCovered(s, pos) ? 0 : openLandCorners(isLandAt);
      drawSheetTile(canvas, key, sheet.land[corners]!, BLOB_COLS, pos);
      continue;
    }
    const piece = sheet.water[coastMask(isLandAt)];
    if (piece !== undefined) drawSheetTile(canvas, key, piece, BLOB_COLS, pos);
  }
}

/** Borde organico entre dos aguas: pieza de la lamina org_<set> segun la casilla y sus 8 vecinos. */
function paintOrganicPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean): void {
  const pieces = ORG_SHEETS[set];
  const key = `blob/org_${set}`;
  if (!pieces || !hasImage(canvas.textures, key)) return;
  const isUpAt = (pos: Pos) => isUp(canvas.map.atClamped(pos));
  for (const { pos } of canvas.map.cells()) {
    const piece = pieces[neighbourKey(pos, isUpAt)]!;
    if (piece >= 0) drawSheetTile(canvas, key, piece, SHEET_COLS, pos);
  }
}

/** Bosques con el juego Wang (solo si no hay arboles sueltos, que van como sprites). */
function paintWangForests(canvas: TerrainCanvas): void {
  const terrains = [...canvas.map.cells()].map((cell) => cell.value);
  for (const overlay of overlaySets(canvas.s.theme)) {
    const isForest = (terrain: number) => overlay.cells.includes(terrain);
    if (terrains.some(isForest)) paintWangPass(canvas, overlay.set, isForest, false);
  }
}

/** Decorados sueltos (flores, cactus, muñeco de nieve), con una variante fija por casilla. */
function paintDecor(canvas: TerrainCanvas): void {
  for (const { pos, value: terrain } of canvas.map.cells()) {
    const decor = DECOR[terrain];
    if (!decor) continue;
    const [base, variants] = decor;
    const key = `${base}_${cellHash(pos) % variants}`;
    if (hasImage(canvas.textures, key)) drawTile(canvas, key, 0, 0, pos.x * TILE, pos.y * TILE);
  }
}

/** Arboles sueltos de Retro Diffusion en el atlas: los bosques van como sprites y no con el juego Wang. */
const hasTreeSprites = (textures: Phaser.Textures.TextureManager): boolean => hasImage(textures, 'flat/tree_grass_0');

/** Pinta el terreno entero del mapa en un lienzo (una sola vez por partida). */
export function paintTerrain(textures: Phaser.Textures.TextureManager, s: GameState): HTMLCanvasElement {
  const map = mapGrid(s);
  const element = document.createElement('canvas');
  element.width = map.width * TILE;
  element.height = map.height * TILE;
  const ctx = element.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const canvas: TerrainCanvas = { textures, s, ctx, map };
  const [deepSet, waterSet, landSet] = groundSets(s.theme);
  // Suelo por niveles: todo agua profunda y encima cada nivel con su borde.
  paintWangPass(canvas, deepSet, () => false, true);
  paintOrganicPass(canvas, deepSet, (terrain) => groundLevel(terrain) >= WATER);
  paintOrganicPass(canvas, waterSet, (terrain) => groundLevel(terrain) >= SHALLOW);
  paintBlobPass(canvas, landSet, isLandTerrain);
  treesLoaded = hasTreeSprites(textures);
  if (!treesLoaded) paintWangForests(canvas);
  paintDecor(canvas);
  // Montañas y bosques no se pintan aqui: van como sprites en la capa de los edificios
  // (terrainObjects), ordenados por fila, para que lo de delante tape a lo de detras.
  return element;
}

/** Sprites de terreno (montañas y bosques) por casilla, para ponerlos en la capa de los edificios. */
export function terrainObjects(textures: Phaser.Textures.TextureManager, s: GameState): { key: string; x: number; y: number }[] {
  const objects: { key: string; x: number; y: number }[] = [];
  const hasTrees = hasTreeSprites(textures);
  for (const { pos } of mapGrid(s).cells()) {
    const key = objectKey(s, pos);
    if (!key || !hasImage(textures, key)) continue;
    if (!hasTrees && key.startsWith('flat/tree_')) continue;
    objects.push({ key, ...pos });
  }
  // Fila a fila (y por fuera, x dentro): la capa de los edificios los ordena por fila.
  return objects.sort((a, b) => a.y - b.y);
}

// ---------------------------------------------------------------------------
// Agua animada (olas, brillos y espuma de la orilla): piezas precompiladas de anim/*.png
// (tools/art/build_sheets.py). Aqui solo se decide que pieza va en cada casilla.
// ---------------------------------------------------------------------------

/** Clave de 9 bits de una casilla: ella (256) y sus vecinos N1 E2 S4 W8 NE16 SE32 SW64 NW128. */
export function neighbourKey(pos: Pos, on: (pos: Pos) => boolean): number {
  const at = (dx: number, dy: number) => on(offset(pos, dx, dy));
  return (
    (at(0, 0) ? 256 : 0) |
    (at(0, -1) ? 1 : 0) |
    (at(1, 0) ? 2 : 0) |
    (at(0, 1) ? 4 : 0) |
    (at(-1, 0) ? 8 : 0) |
    (at(1, -1) ? 16 : 0) |
    (at(1, 1) ? 32 : 0) |
    (at(-1, 1) ? 64 : 0) |
    (at(-1, -1) ? 128 : 0)
  );
}

export interface AnimCell {
  x: number;
  y: number;
  /** Textura (anim/water o anim/shore_<set>) y fila de la lamina. */
  key: string;
  row: number;
  /** Desfase en fotogramas para que no vayan todas a la vez. */
  phase: number;
}

/** Fotogramas de la animacion del agua (el desfase de cada casilla va de 0 a esto). */
const WATER_FRAMES = 12;

/** Casillas con agua animada: olas y brillos en el agua, y espuma donde el agua toca tierra. */
export function waterAnimCells(s: GameState): AnimCell[] {
  const map = mapGrid(s);
  /** Fuera del mapa cuenta como agua (sin espuma contra el borde). */
  const isLandAt = (pos: Pos) => map.contains(pos) && isLandTerrain(map.at(pos));
  const shoreSet = groundSets(s.theme)[2];
  const shoreRows = SHORE_ROWS[shoreSet] ?? {};
  const cells: AnimCell[] = [];
  for (const { pos, value: terrain } of map.cells()) {
    if (isLandTerrain(terrain)) continue;
    const hash = cellHash(pos);
    // El hielo no tiene olas, pero si espuma en la orilla.
    if (terrain !== TerrainType.ICE) {
      const rows = terrain === TerrainType.DEEP_WATER ? WATER_ROWS.deep : WATER_ROWS.water;
      cells.push({ ...pos, key: 'anim/water', row: rows[hash % rows.length]!, phase: hash % WATER_FRAMES });
    }
    // Espuma: mascara de costa igual que la de la lamina blob.
    const coast = coastMask((dx, dy) => isLandAt(offset(pos, dx, dy)));
    const row = shoreRows[coast];
    if (coast && row !== undefined) cells.push({ ...pos, key: `anim/shore_${shoreSet}`, row, phase: 0 });
  }
  return cells;
}

/** Si el mapa actual se pinto con arboles sueltos (para elegir el primer plano). */
let treesLoaded = false;

/** Variantes de cada sprite de terreno (tools/art/rd_terrain.py). */
const OBJ_VARIANTS: Record<string, number> = { mount_grass: 4, mount_snow: 4, mount_mesa: 4, tree_grass: 4, tree_snow: 2 };

/** El terreno de la casilla (undefined fuera del mapa). */
function terrainOn(s: GameState, tile: Pos): number | undefined {
  const map = mapGrid(s);
  return map.contains(tile) ? map.at(tile) : undefined;
}

/** Nombre base del sprite de la casilla (montaña o bosque), sin variante. */
function objectBase(s: GameState, tile: Pos): string | null {
  const terrain = terrainOn(s, tile);
  if (terrain === TerrainType.WOODS) return s.theme === SNOWY ? 'tree_snow' : 'tree_grass';
  if (terrain === TerrainType.SNOW_WOOD) return 'tree_snow';
  const mountain = mountainKind(s, tile);
  return mountain ? `mount_${mountain}` : null;
}

/** Numero fijo por casilla para elegir la variante de su sprite (otro distinto del de los decorados). */
const objectHash = (pos: Pos): number => ((pos.x * 2654435761) ^ (pos.y * 40503)) >>> 0;

/** Sprite de la casilla con su variante fija (la misma en cada dibujo). */
function objectKey(s: GameState, tile: Pos, prefix = ''): string | null {
  const base = objectBase(s, tile);
  if (!base) return null;
  return `flat/${prefix}${base}_${objectHash(tile) % OBJ_VARIANTS[base]!}`;
}

function mountainKind(s: GameState, tile: Pos): 'grass' | 'snow' | 'mesa' | null {
  const terrain = terrainOn(s, tile);
  if (terrain === TerrainType.GRASS_CLIFF) return s.theme === SNOWY ? 'snow' : 'grass';
  if (terrain === TerrainType.SNOW_CLIFF) return 'snow';
  if (terrain === TerrainType.SAND_CLIFF) return 'mesa';
  return null;
}

/** Primer plano que tapa los pies de una unidad en esa casilla (null si no hay). */
export function frontKey(s: GameState, tile: Pos): string | null {
  const terrain = terrainOn(s, tile);
  // Bosque pintado con el juego Wang (sin arboles sueltos): su primer plano es una pieza Wang.
  if (terrain !== undefined && FORESTS.includes(terrain) && !treesLoaded) {
    const isSnowForest = terrain === TerrainType.SNOW_WOOD || s.theme === SNOWY;
    return isSnowForest ? 'wang/front_snow_forest' : 'wang/front_grass_forest';
  }
  return objectKey(s, tile, 'front_');
}
