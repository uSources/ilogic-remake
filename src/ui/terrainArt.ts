import type Phaser from 'phaser';
import { TerrainType, THEME_NAMES } from '../core/data';
import type { GameState, Pos } from '../core/model';
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
const cellHash = (x: number, y: number): number => ((x * 73856093) ^ (y * 19349663)) >>> 0;

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
  /** Tamaño del mapa en casillas. */
  readonly width: number;
  readonly height: number;
}

/** Columnas de las laminas blob (tools/art/build_blob.py). */
const BLOB_COLS = 8;

/** Terreno de una casilla; fuera del mapa, el de la casilla del borde mas cercana. */
function clampedTerrain(s: GameState, x: number, y: number): number {
  const width = s.map.length;
  const height = s.map[0]!.length;
  return s.map[Math.min(width - 1, Math.max(0, x))]![Math.min(height - 1, Math.max(0, y))]!;
}

/** Copia una casilla (TILE x TILE) de una imagen cargada al lienzo (respeta su sitio dentro del atlas). */
function drawTile(canvas: TerrainCanvas, key: string, sourceX: number, sourceY: number, x: number, y: number): void {
  const frame = imageFrame(canvas.textures, key);
  canvas.ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX + sourceX, frame.cutY + sourceY, TILE, TILE, x, y, TILE, TILE);
}

/** Copia la pieza numero `index` de una lamina de `columns` columnas en la casilla (x, y). */
function drawSheetTile(canvas: TerrainCanvas, key: string, index: number, columns: number, x: number, y: number): void {
  drawTile(canvas, key, (index % columns) * TILE, Math.floor(index / columns) * TILE, x * TILE, y * TILE);
}

/**
 * Pieza Wang de la esquina (x, y) de la rejilla doble: que casillas de las cuatro que la rodean
 * cuentan como "arriba" (NO 8, NE 4, SO 2, SE 1).
 */
function wangCorners(s: GameState, x: number, y: number, isUp: (terrain: number) => boolean): number {
  const at = (cx: number, cy: number) => isUp(clampedTerrain(s, cx, cy));
  return (at(x - 1, y - 1) ? 8 : 0) | (at(x, y - 1) ? 4 : 0) | (at(x - 1, y) ? 2 : 0) | (at(x, y) ? 1 : 0);
}

/** Recorre las piezas de la rejilla doble con el juego Wang `set`; `drawEmpty`: tambien las que no tienen nada "arriba". */
function paintWangPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean, drawEmpty: boolean): void {
  const frames = WANG_SETS[set];
  if (!frames || !hasImage(canvas.textures, `wang/${set}`)) return;
  const half = TILE / 2;
  for (let x = 0; x <= canvas.width; x++)
    for (let y = 0; y <= canvas.height; y++) {
      const corners = wangCorners(canvas.s, x, y, isUp);
      if (!corners && !drawEmpty) continue;
      drawTile(canvas, `wang/${set}`, frames[corners]! * TILE, 0, x * TILE - half, y * TILE - half);
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
const isCovered = (s: GameState, x: number, y: number): boolean =>
  objectBase(s, { x, y }) !== null || s.buildings.some((building) => building.x === x && building.y === y);

/** Coloca las piezas de la lamina blob (tools/art/build_blob.py) segun los vecinos de cada casilla. */
function paintBlobPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean): void {
  const sheet = BLOB_SETS[set];
  const key = `blob/${set}`;
  if (!sheet || !hasImage(canvas.textures, key)) return;
  const { s, width, height } = canvas;
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && isUp(clampedTerrain(s, x, y));
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++) {
      // Fuera del mapa cuenta como lo de la casilla (sin orilla contra el borde).
      const isLandAt = (dx: number, dy: number) => {
        const nx = x + dx;
        const ny = y + dy;
        return nx < 0 || ny < 0 || nx >= width || ny >= height ? isLand(x, y) : isLand(nx, ny);
      };
      if (isLand(x, y)) {
        const corners = isCovered(s, x, y) ? 0 : openLandCorners(isLandAt);
        drawSheetTile(canvas, key, sheet.land[corners]!, BLOB_COLS, x, y);
        continue;
      }
      const piece = sheet.water[coastMask(isLandAt)];
      if (piece !== undefined) drawSheetTile(canvas, key, piece, BLOB_COLS, x, y);
    }
}

/** Borde organico entre dos aguas: pieza de la lamina org_<set> segun la casilla y sus 8 vecinos. */
function paintOrganicPass(canvas: TerrainCanvas, set: string, isUp: (terrain: number) => boolean): void {
  const pieces = ORG_SHEETS[set];
  const key = `blob/org_${set}`;
  if (!pieces || !hasImage(canvas.textures, key)) return;
  const isUpAt = (x: number, y: number) => isUp(clampedTerrain(canvas.s, x, y));
  for (let x = 0; x < canvas.width; x++)
    for (let y = 0; y < canvas.height; y++) {
      const piece = pieces[neighbourKey(x, y, isUpAt)]!;
      if (piece >= 0) drawSheetTile(canvas, key, piece, SHEET_COLS, x, y);
    }
}

/** Bosques con el juego Wang (solo si no hay arboles sueltos, que van como sprites). */
function paintWangForests(canvas: TerrainCanvas): void {
  const { s } = canvas;
  for (const overlay of overlaySets(s.theme)) {
    const isForest = (terrain: number) => overlay.cells.includes(terrain);
    if (s.map.some((column) => column.some(isForest))) paintWangPass(canvas, overlay.set, isForest, false);
  }
}

/** Decorados sueltos (flores, cactus, muñeco de nieve), con una variante fija por casilla. */
function paintDecor(canvas: TerrainCanvas): void {
  for (let x = 0; x < canvas.width; x++)
    for (let y = 0; y < canvas.height; y++) {
      const decor = DECOR[canvas.s.map[x]![y]!];
      if (!decor) continue;
      const [base, variants] = decor;
      const key = `${base}_${cellHash(x, y) % variants}`;
      if (hasImage(canvas.textures, key)) drawTile(canvas, key, 0, 0, x * TILE, y * TILE);
    }
}

/** Arboles sueltos de Retro Diffusion en el atlas: los bosques van como sprites y no con el juego Wang. */
const hasTreeSprites = (textures: Phaser.Textures.TextureManager): boolean => hasImage(textures, 'flat/tree_grass_0');

/** Pinta el terreno entero del mapa en un lienzo (una sola vez por partida). */
export function paintTerrain(textures: Phaser.Textures.TextureManager, s: GameState): HTMLCanvasElement {
  const width = s.map.length;
  const height = s.map[0]!.length;
  const element = document.createElement('canvas');
  element.width = width * TILE;
  element.height = height * TILE;
  const ctx = element.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const canvas: TerrainCanvas = { textures, s, ctx, width, height };
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
  // Fila a fila (y por fuera): la capa de los edificios los ordena por fila.
  for (let y = 0; y < s.map[0]!.length; y++)
    for (let x = 0; x < s.map.length; x++) {
      const key = objectKey(s, { x, y });
      if (!key || !hasImage(textures, key)) continue;
      if (!hasTrees && key.startsWith('flat/tree_')) continue;
      objects.push({ key, x, y });
    }
  return objects;
}

// ---------------------------------------------------------------------------
// Agua animada (olas, brillos y espuma de la orilla): piezas precompiladas de anim/*.png
// (tools/art/build_sheets.py). Aqui solo se decide que pieza va en cada casilla.
// ---------------------------------------------------------------------------

/** Clave de 9 bits de una casilla: ella (256) y sus vecinos N1 E2 S4 W8 NE16 SE32 SW64 NW128. */
export function neighbourKey(x: number, y: number, on: (x: number, y: number) => boolean): number {
  return (
    (on(x, y) ? 256 : 0) |
    (on(x, y - 1) ? 1 : 0) |
    (on(x + 1, y) ? 2 : 0) |
    (on(x, y + 1) ? 4 : 0) |
    (on(x - 1, y) ? 8 : 0) |
    (on(x + 1, y - 1) ? 16 : 0) |
    (on(x + 1, y + 1) ? 32 : 0) |
    (on(x - 1, y + 1) ? 64 : 0) |
    (on(x - 1, y - 1) ? 128 : 0)
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
  const width = s.map.length;
  const height = s.map[0]!.length;
  /** Fuera del mapa: null (ni tierra ni agua). */
  const isLand = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? null : isLandTerrain(clampedTerrain(s, x, y)));
  const shoreSet = groundSets(s.theme)[2];
  const shoreRows = SHORE_ROWS[shoreSet] ?? {};
  const cells: AnimCell[] = [];
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++) {
      if (isLand(x, y)) continue;
      const hash = cellHash(x, y);
      const terrain = clampedTerrain(s, x, y);
      // El hielo no tiene olas, pero si espuma en la orilla.
      if (terrain !== TerrainType.ICE) {
        const rows = terrain === TerrainType.DEEP_WATER ? WATER_ROWS.deep : WATER_ROWS.water;
        cells.push({ x, y, key: 'anim/water', row: rows[hash % rows.length]!, phase: hash % WATER_FRAMES });
      }
      // Espuma: mascara de costa igual que la de la lamina blob (fuera del mapa cuenta como agua).
      const coast = coastMask((dx, dy) => isLand(x + dx, y + dy) ?? false);
      const row = shoreRows[coast];
      if (coast && row !== undefined) cells.push({ x, y, key: `anim/shore_${shoreSet}`, row, phase: 0 });
    }
  return cells;
}

/** Si el mapa actual se pinto con arboles sueltos (para elegir el primer plano). */
let treesLoaded = false;

/** Variantes de cada sprite de terreno (tools/art/rd_terrain.py). */
const OBJ_VARIANTS: Record<string, number> = { mount_grass: 4, mount_snow: 4, mount_mesa: 4, tree_grass: 4, tree_snow: 2 };

/** Nombre base del sprite de la casilla (montaña o bosque), sin variante. */
function objectBase(s: GameState, tile: Pos): string | null {
  const terrain = s.map[tile.x]?.[tile.y];
  if (terrain === TerrainType.WOODS) return s.theme === SNOWY ? 'tree_snow' : 'tree_grass';
  if (terrain === TerrainType.SNOW_WOOD) return 'tree_snow';
  const mountain = mountainKind(s, tile);
  return mountain ? `mount_${mountain}` : null;
}

/** Numero fijo por casilla para elegir la variante de su sprite (otro distinto del de los decorados). */
const objectHash = (x: number, y: number): number => ((x * 2654435761) ^ (y * 40503)) >>> 0;

/** Sprite de la casilla con su variante fija (la misma en cada dibujo). */
function objectKey(s: GameState, tile: Pos, prefix = ''): string | null {
  const base = objectBase(s, tile);
  if (!base) return null;
  return `flat/${prefix}${base}_${objectHash(tile.x, tile.y) % OBJ_VARIANTS[base]!}`;
}

function mountainKind(s: GameState, tile: Pos): 'grass' | 'snow' | 'mesa' | null {
  const terrain = s.map[tile.x]?.[tile.y];
  if (terrain === TerrainType.GRASS_CLIFF) return s.theme === SNOWY ? 'snow' : 'grass';
  if (terrain === TerrainType.SNOW_CLIFF) return 'snow';
  if (terrain === TerrainType.SAND_CLIFF) return 'mesa';
  return null;
}

/** Primer plano que tapa los pies de una unidad en esa casilla (null si no hay). */
export function frontKey(s: GameState, tile: Pos): string | null {
  const terrain = s.map[tile.x]?.[tile.y];
  // Bosque pintado con el juego Wang (sin arboles sueltos): su primer plano es una pieza Wang.
  if (terrain !== undefined && FORESTS.includes(terrain) && !treesLoaded) {
    const isSnowForest = terrain === TerrainType.SNOW_WOOD || s.theme === SNOWY;
    return isSnowForest ? 'wang/front_snow_forest' : 'wang/front_grass_forest';
  }
  return objectKey(s, tile, 'front_');
}
