import type Phaser from 'phaser';
import { TILE } from '../layout';

/**
 * Niebla de guerra del dibujo nuevo: un velo azul oscuro con el borde organico y tramado
 * (dither) en pixeles, en vez de cuadrados grises. Se recalcula solo cuando cambia lo que se ve.
 */
const FOG = [16, 24, 44];
const ALPHA = 150; // de 255
// Tramado ordenado de Bayer 4x4 (0..15).
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function hash(i: number, j: number): number {
  let h = i * 374761393 + j * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
}

function noise(px: number, py: number): number {
  const G = 10;
  const i = Math.floor(px / G),
    j = Math.floor(py / G);
  const fx = px / G - i,
    fy = py / G - j;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx;
  const b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
  return a + (b - a) * sy;
}

/** Pinta la niebla de un mapa (vis[x][y] = se ve) en un lienzo del tamaño del mapa. */
export function paintFog(vis: boolean[][], cv?: HTMLCanvasElement): HTMLCanvasElement {
  const W = vis.length,
    H = vis[0]!.length;
  const PW = W * TILE,
    PH = H * TILE;
  if (!cv) cv = document.createElement('canvas');
  if (cv.width !== PW || cv.height !== PH) {
    cv.width = PW;
    cv.height = PH;
  }
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(PW, PH);
  const d = img.data;
  const hid = (x: number, y: number) => (vis[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]! ? 0 : 1);
  const put = (px: number, py: number, a: number) => {
    const o = (py * PW + px) * 4;
    d[o] = FOG[0]!;
    d[o + 1] = FOG[1]!;
    d[o + 2] = FOG[2]!;
    d[o + 3] = a;
  };
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      // Casillas sin borde cerca: relleno liso (o nada).
      let same = true;
      const h0 = hid(x, y);
      for (let dx = -1; dx <= 1 && same; dx++) for (let dy = -1; dy <= 1; dy++) if (hid(x + dx, y + dy) !== h0) same = false;
      if (same) {
        if (h0) for (let py = y * TILE; py < y * TILE + TILE; py++) for (let px = x * TILE; px < x * TILE + TILE; px++) put(px, py, ALPHA);
        continue;
      }
      for (let py = y * TILE; py < y * TILE + TILE; py++)
        for (let px = x * TILE; px < x * TILE + TILE; px++) {
          const gx = (px + 0.5) / TILE - 0.5,
            gy = (py + 0.5) / TILE - 0.5;
          const cx = Math.floor(gx),
            cy = Math.floor(gy);
          const fx = gx - cx,
            fy = gy - cy;
          const sx = fx * fx * (3 - 2 * fx),
            sy = fy * fy * (3 - 2 * fy);
          const a = hid(cx, cy) + (hid(cx + 1, cy) - hid(cx, cy)) * sx;
          const b = hid(cx, cy + 1) + (hid(cx + 1, cy + 1) - hid(cx, cy + 1)) * sx;
          const f = a + (b - a) * sy + noise(px, py) * 0.38;
          // Banda del borde (0.35..0.65): tramado de mas a menos denso.
          const t = (f - 0.35) / 0.3;
          if (t <= 0) continue;
          if (t >= 1) {
            put(px, py, ALPHA);
            continue;
          }
          if (t * 16 > BAYER[(py & 3) * 4 + (px & 3)]!) put(px, py, ALPHA);
        }
    }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** Firma de una matriz de visibilidad (para no repintar si no cambia). */
export function visKey(vis: boolean[][]): string {
  let s = '';
  for (const col of vis) for (const v of col) s += v ? '1' : '0';
  return s;
}

/** Bruma que se mueve dentro de la niebla: nubecillas translucidas que solo se ven sobre lo oculto. */
export interface Mist {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  alpha: number;
}
