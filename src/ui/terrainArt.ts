import type Phaser from 'phaser';
import type { GameState } from '../core/types';
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

// Terrenos: 0 Grass, 1 Water, 2 Woods, 3 Sand, 4 Cactus, 5 SandCliff, 6 Flowers, 7 GrassCliff,
// 8 SWater, 9 DWater, 10 Snow, 11 Frosty, 12 SnowCliff, 13 SnowWood, 14 Ice
const LEVEL = [3, 1, 3, 3, 3, 3, 3, 3, 2, 0, 3, 3, 3, 3, 2];
/** Decorados sueltos y cuantas variantes hay de cada uno. */
const DECOR: Record<number, [string, number]> = { 6: ['wang/decor_flowers', 3], 4: ['wang/decor_cactus', 3], 11: ['wang/decor_frosty', 3] };
const decorKeys = (): string[] => Object.values(DECOR).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${k}_${i}`));

function groundSets(theme: number): [string, string, string] {
  const snow = theme === 4;
  const land = theme === 1 ? 'ts_shallow_sand' : snow ? 'ts_ice_snow' : 'ts_shallow_grass';
  return ['ts_deep_water', snow ? 'ts_water_ice' : 'ts_water_shallow2', land];
}

function overlaySets(theme: number): { set: string; cells: number[] }[] {
  const snow = theme === 4;
  return [
    { set: snow ? 'ts_snow_forest' : 'ts_grass_forest', cells: snow ? [2, 13] : [2] },
    ...(snow ? [] : [{ set: 'ts_snow_forest', cells: [13] }]),
  ];
}

/** Todas las imagenes que hacen falta (para saber si se puede usar el terreno nuevo). */
export function terrainArtKeys(): string[] {
  return [...Object.keys(WANG_SETS).map((k) => `wang/${k}`), ...decorKeys()];
}

export function terrainArtReady(textures: Phaser.Textures.TextureManager): boolean {
  return terrainArtKeys().every((k) => textures.exists(k));
}

/** Pinta el terreno entero del mapa en un lienzo (una sola vez por partida). */
export function paintTerrain(textures: Phaser.Textures.TextureManager, s: GameState): HTMLCanvasElement {
  const W = s.map.length,
    H = s.map[0]!.length;
  const cv = document.createElement('canvas');
  cv.width = W * TILE;
  cv.height = H * TILE;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const src = (key: string) => textures.get(key).getSourceImage() as CanvasImageSource;
  /** Dibuja un trozo de una imagen cargada (respeta su sitio dentro del atlas). */
  const blit = (into: CanvasRenderingContext2D, key: string, sx: number, sy: number, w: number, h: number, dx: number, dy: number) => {
    const f = textures.getFrame(key);
    into.drawImage(f.source.image as CanvasImageSource, f.cutX + sx, f.cutY + sy, w, h, dx, dy, w, h);
  };
  const cell = (x: number, y: number) => s.map[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!;
  const half = TILE / 2;

  /** Recorre las piezas de la rejilla doble: `up(t)` dice si la casilla cuenta como "arriba". */
  const pass = (set: string, up: (t: number) => boolean, always: boolean, into = ctx) => {
    const frames = WANG_SETS[set];
    if (!frames || !textures.exists(`wang/${set}`)) return;
    for (let x = 0; x <= W; x++)
      for (let y = 0; y <= H; y++) {
        const k = (up(cell(x - 1, y - 1)) ? 8 : 0) | (up(cell(x, y - 1)) ? 4 : 0) | (up(cell(x - 1, y)) ? 2 : 0) | (up(cell(x, y)) ? 1 : 0);
        if (!k && !always) continue;
        blit(into, `wang/${set}`, frames[k]! * TILE, 0, TILE, TILE, x * TILE - half, y * TILE - half);
      }
  };

  /** Coloca las piezas de la lamina blob (tools/art/build_blob.py) segun los vecinos de cada casilla. */
  const passBlob = (set: string, up: (t: number) => boolean, into: CanvasRenderingContext2D): boolean => {
    const bs = BLOB_SETS[set];
    const key = `blob/${set}`;
    if (!bs || !textures.exists(key)) return false;
    const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && up(cell(x, y));
    const occupied = (x: number, y: number) => objectBase(s, x, y) !== null || s.buildings.some((b) => b.x === x && b.y === y);
    const draw = (i: number, x: number, y: number) => blit(into, key, (i % 8) * TILE, Math.floor(i / 8) * TILE, TILE, TILE, x * TILE, y * TILE);
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        // Fuera del mapa cuenta como lo de la casilla (sin orilla contra el borde).
        const L = (dx: number, dy: number) => {
          const xx = x + dx,
            yy = y + dy;
          return xx < 0 || yy < 0 || xx >= W || yy >= H ? isLand(x, y) : isLand(xx, yy);
        };
        if (isLand(x, y)) {
          let k = 0;
          if (!occupied(x, y)) {
            if (!L(-1, 0) && !L(0, -1) && !L(-1, -1)) k |= 1;
            if (!L(1, 0) && !L(0, -1) && !L(1, -1)) k |= 2;
            if (!L(-1, 0) && !L(0, 1) && !L(-1, 1)) k |= 4;
            if (!L(1, 0) && !L(0, 1) && !L(1, 1)) k |= 8;
          }
          draw(bs.land[k]!, x, y);
          continue;
        }
        let m = (L(0, -1) ? 1 : 0) | (L(1, 0) ? 2 : 0) | (L(0, 1) ? 4 : 0) | (L(-1, 0) ? 8 : 0);
        if (!(m & 1) && !(m & 2) && L(1, -1)) m |= 16;
        if (!(m & 4) && !(m & 2) && L(1, 1)) m |= 32;
        if (!(m & 4) && !(m & 8) && L(-1, 1)) m |= 64;
        if (!(m & 1) && !(m & 8) && L(-1, -1)) m |= 128;
        const i = bs.water[m];
        if (i !== undefined) draw(i, x, y);
      }
    return true;
  };

  /** Borde organico entre dos aguas: pieza de la lamina org_<set> segun la casilla y sus 8 vecinos. */
  const passOrg = (set: string, up: (t: number) => boolean) => {
    const idx = ORG_SHEETS[set];
    const key = `blob/org_${set}`;
    if (!idx || !textures.exists(key)) return;
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        const i = idx[neighbourKey(x, y, (xx, yy) => up(cell(xx, yy)))]!;
        if (i >= 0) blit(ctx, key, (i % SHEET_COLS) * TILE, Math.floor(i / SHEET_COLS) * TILE, TILE, TILE, x * TILE, y * TILE);
      }
  };

  const [l1, l2, l3] = groundSets(s.theme);
  pass(l1, () => false, true); // todo agua profunda
  passOrg(l1, (t) => LEVEL[t]! >= 1);
  passOrg(l2, (t) => LEVEL[t]! >= 2);
  passBlob(l3, (t) => LEVEL[t]! >= 3, ctx);
  // Bosques: si hay arboles sueltos (Retro Diffusion) se dibujan como sprites mas abajo; si no, el tileset Wang.
  const trees = textures.exists('flat/tree_grass_0');
  treesLoaded = trees;
  if (!trees)
    for (const o of overlaySets(s.theme)) if (s.map.some((col) => col.some((t) => o.cells.includes(t)))) pass(o.set, (t) => o.cells.includes(t), false);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const d = DECOR[s.map[x]![y]!];
      if (!d) continue;
      // Variante fija por casilla (la misma cada vez que se dibuja el mapa).
      const k = `${d[0]}_${(((x * 73856093) ^ (y * 19349663)) >>> 0) % d[1]}`;
      if (textures.exists(k)) blit(ctx, k, 0, 0, TILE, TILE, x * TILE, y * TILE);
    }
  // Montañas y bosques no se pintan aqui: van como sprites en la capa de los edificios
  // (terrainObjects), ordenados por fila, para que lo de delante tape a lo de detras.
  return cv;
}

/** Sprites de terreno (montañas y bosques) por casilla, para ponerlos en la capa de los edificios. */
export function terrainObjects(textures: Phaser.Textures.TextureManager, s: GameState): { key: string; x: number; y: number }[] {
  const out: { key: string; x: number; y: number }[] = [];
  const trees = textures.exists('flat/tree_grass_0');
  for (let y = 0; y < s.map[0]!.length; y++)
    for (let x = 0; x < s.map.length; x++) {
      const k = objectKey(s, x, y);
      if (!k || !textures.exists(k) || (!trees && k.startsWith('flat/tree_'))) continue;
      out.push({ key: k, x, y });
    }
  return out;
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

/** Casillas con agua animada: olas y brillos en el agua, y espuma donde el agua toca tierra. */
export function waterAnimCells(s: GameState): AnimCell[] {
  const W = s.map.length,
    H = s.map[0]!.length;
  const t = (x: number, y: number) => s.map[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!;
  const land = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : LEVEL[t(x, y)]! >= 3);
  const shoreSet = groundSets(s.theme)[2];
  const shoreRows = SHORE_ROWS[shoreSet] ?? {};
  const out: AnimCell[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (land(x, y)) continue;
      const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
      if (t(x, y) !== 14) {
        const rows = t(x, y) === 9 ? WATER_ROWS.deep : WATER_ROWS.water;
        out.push({ x, y, key: 'anim/water', row: rows[h % rows.length]!, phase: h % 12 });
      }
      // Espuma: mascara de costa igual que la de la lamina blob (fuera del mapa cuenta como agua).
      const L = (dx: number, dy: number) => land(x + dx, y + dy) ?? false;
      let m = (L(0, -1) ? 1 : 0) | (L(1, 0) ? 2 : 0) | (L(0, 1) ? 4 : 0) | (L(-1, 0) ? 8 : 0);
      if (!(m & 1) && !(m & 2) && L(1, -1)) m |= 16;
      if (!(m & 4) && !(m & 2) && L(1, 1)) m |= 32;
      if (!(m & 4) && !(m & 8) && L(-1, 1)) m |= 64;
      if (!(m & 1) && !(m & 8) && L(-1, -1)) m |= 128;
      const row = shoreRows[m];
      if (m && row !== undefined) out.push({ x, y, key: `anim/shore_${shoreSet}`, row, phase: 0 });
    }
  return out;
}

/** Si el mapa actual se pinto con arboles sueltos (para elegir el primer plano). */
let treesLoaded = false;

/** Variantes de cada sprite de terreno (tools/art/rd_terrain.py). */
const OBJ_VARIANTS: Record<string, number> = { mount_grass: 4, mount_snow: 4, mount_mesa: 4, tree_grass: 4, tree_snow: 2 };

/** Nombre base del sprite de la casilla (montaña o bosque), sin variante. */
function objectBase(s: GameState, x: number, y: number): string | null {
  const t = s.map[x]?.[y];
  if (t === 2) return s.theme === 4 ? 'tree_snow' : 'tree_grass';
  if (t === 13) return 'tree_snow';
  const m = mountainKind(s, x, y);
  return m ? `mount_${m}` : null;
}

/** Sprite de la casilla con su variante fija (la misma en cada dibujo). */
function objectKey(s: GameState, x: number, y: number, prefix = ''): string | null {
  const b = objectBase(s, x, y);
  if (!b) return null;
  return `flat/${prefix}${b}_${(((x * 2654435761) ^ (y * 40503)) >>> 0) % OBJ_VARIANTS[b]!}`;
}

function mountainKind(s: GameState, x: number, y: number): 'grass' | 'snow' | 'mesa' | null {
  const t = s.map[x]?.[y];
  if (t === 7) return s.theme === 4 ? 'snow' : 'grass';
  if (t === 12) return 'snow';
  if (t === 5) return 'mesa';
  return null;
}

/** Primer plano que tapa los pies de una unidad en esa casilla (null si no hay). */
export function frontKey(s: GameState, x: number, y: number): string | null {
  const t = s.map[x]?.[y];
  const snow = s.theme === 4;
  if ((t === 2 || t === 13) && !treesLoaded) return t === 13 || snow ? 'wang/front_snow_forest' : 'wang/front_grass_forest';
  return objectKey(s, x, y, 'front_');
}
