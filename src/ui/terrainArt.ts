import type Phaser from 'phaser';
import type { GameState } from '../core/types';
import { TILE } from '../layout';
import { WANG_SETS } from './wangSets';

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
const DECOR: Record<number, string> = { 6: 'wang/decor_flowers', 4: 'wang/decor_cactus', 11: 'wang/decor_frosty' };

function groundSets(theme: number): [string, string, string] {
  const snow = theme === 4;
  const land = theme === 1 ? 'ts_shallow_sand' : snow ? 'ts_ice_snow' : 'ts_shallow_grass';
  return ['ts_deep_water', snow ? 'ts_water_ice' : 'ts_water_shallow', land];
}

function overlaySets(theme: number): { set: string; cells: number[] }[] {
  const snow = theme === 4;
  return [
    { set: snow ? 'ts_snow_forest' : 'ts_grass_forest', cells: snow ? [2, 13] : [2] },
    ...(snow ? [] : [{ set: 'ts_snow_forest', cells: [13] }]),
    { set: snow ? 'ts_snow_mountain' : 'ts_grass_mountain', cells: snow ? [7, 12] : [7] },
    ...(snow ? [] : [{ set: 'ts_snow_mountain', cells: [12] }]),
    { set: 'ts_sand_mesa', cells: [5] },
  ];
}

/** Todas las imagenes que hacen falta (para saber si se puede usar el terreno nuevo). */
export function terrainArtKeys(): string[] {
  return [...Object.keys(WANG_SETS).map((k) => `wang/${k}`), ...Object.values(DECOR)];
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
  const cell = (x: number, y: number) => s.map[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!;
  const half = TILE / 2;

  /** Recorre las piezas de la rejilla doble: `up(t)` dice si la casilla cuenta como "arriba". */
  const pass = (set: string, up: (t: number) => boolean, always: boolean) => {
    const frames = WANG_SETS[set];
    if (!frames || !textures.exists(`wang/${set}`)) return;
    const img = src(`wang/${set}`);
    for (let x = 0; x <= W; x++)
      for (let y = 0; y <= H; y++) {
        const k = (up(cell(x - 1, y - 1)) ? 8 : 0) | (up(cell(x, y - 1)) ? 4 : 0) | (up(cell(x - 1, y)) ? 2 : 0) | (up(cell(x, y)) ? 1 : 0);
        if (!k && !always) continue;
        ctx.drawImage(img, frames[k]! * TILE, 0, TILE, TILE, x * TILE - half, y * TILE - half, TILE, TILE);
      }
  };

  const [l1, l2, l3] = groundSets(s.theme);
  pass(l1, (t) => LEVEL[t]! >= 1, true);
  pass(l2, (t) => LEVEL[t]! >= 2, false);
  pass(l3, (t) => LEVEL[t]! >= 3, false);
  for (const o of overlaySets(s.theme)) if (s.map.some((col) => col.some((t) => o.cells.includes(t)))) pass(o.set, (t) => o.cells.includes(t), false);
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const d = DECOR[s.map[x]![y]!];
      if (d && textures.exists(d)) ctx.drawImage(src(d), x * TILE, y * TILE);
    }
  return cv;
}

// ---------------------------------------------------------------------------
// Agua animada: olas que van y vienen, brillos que parpadean y espuma en la orilla
// ---------------------------------------------------------------------------

interface WaterMark {
  x: number;
  y: number;
  kind: 'wave' | 'spark' | 'foam';
  /** Desfase (0..1) para que no se muevan todas a la vez. */
  phase: number;
  /** Para la espuma: direccion hacia la tierra. */
  dx?: number;
  dy?: number;
  len?: number;
}

/** Puntos del agua que se animan (se calculan una vez por mapa). */
export function waterMarks(s: GameState, seed = 1): WaterMark[] {
  const W = s.map.length,
    H = s.map[0]!.length;
  let r = seed >>> 0 || 1;
  const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const water = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && LEVEL[s.map[x]![y]!]! < 3 && s.map[x]![y]! !== 14;
  const land = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && LEVEL[s.map[x]![y]!]! === 3;
  const out: WaterMark[] = [];
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      if (!water(x, y)) continue;
      const deep = s.map[x]![y]! === 9;
      // Una ola corta por casilla (dos en las profundas) y un brillo de vez en cuando.
      for (let i = 0; i < (deep ? 2 : 1); i++)
        out.push({ x: x * TILE + 4 + Math.floor(rnd() * 20), y: y * TILE + 4 + Math.floor(rnd() * 24), kind: 'wave', phase: rnd(), len: 4 + Math.floor(rnd() * 4) });
      if (rnd() < 0.45) out.push({ x: x * TILE + 3 + Math.floor(rnd() * 26), y: y * TILE + 3 + Math.floor(rnd() * 26), kind: 'spark', phase: rnd() });
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!land(x + dx, y + dy)) continue;
        // Espuma a lo largo del borde con la tierra (que esta en el limite de las dos casillas).
        for (let k = 0; k < 3; k++) {
          const t = 5 + k * 9 + Math.floor(rnd() * 4);
          const ex = dx > 0 ? x * TILE + TILE - 3 : dx < 0 ? x * TILE + 3 : x * TILE + t;
          const ey = dy > 0 ? y * TILE + TILE - 3 : dy < 0 ? y * TILE + 3 : y * TILE + t;
          out.push({ x: ex, y: ey, kind: 'foam', phase: rnd(), dx, dy });
        }
      }
    }
  return out;
}

/** Dibuja el fotograma `f` (0..7) del agua. */
export function drawWater(g: Phaser.GameObjects.Graphics, marks: WaterMark[], f: number): void {
  g.clear();
  for (const m of marks) {
    const p = (f / 8 + m.phase) % 1;
    if (m.kind === 'wave') {
      // Ola: una raya clara que se desplaza 2 px y se encoge en la mitad del ciclo.
      const off = Math.round(Math.sin(p * Math.PI * 2) * 2);
      const len = p < 0.5 ? m.len! : m.len! - 2;
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(m.x + off, m.y, len, 1);
      g.fillStyle(0x0b3a6b, 0.18);
      g.fillRect(m.x + off + 1, m.y + 1, len - 1, 1);
    } else if (m.kind === 'spark') {
      // Brillo: aparece en un tramo corto del ciclo, primero como punto y luego como cruz.
      if (p < 0.08) {
        g.fillStyle(0xffffff, 0.9);
        g.fillRect(m.x, m.y, 1, 1);
      } else if (p < 0.16) {
        g.fillStyle(0xffffff, 0.85);
        g.fillRect(m.x - 1, m.y, 3, 1);
        g.fillRect(m.x, m.y - 1, 1, 3);
      }
    } else {
      // Espuma: puntos blancos que se acercan y se alejan de la orilla.
      const k = Math.round((Math.sin(p * Math.PI * 2) + 1) * 1.5);
      const x = m.x - m.dx! * k,
        y = m.y - m.dy! * k;
      g.fillStyle(0xffffff, 0.75);
      if (m.dx) g.fillRect(x, y, 1, 2);
      else g.fillRect(x, y, 2, 1);
    }
  }
}
