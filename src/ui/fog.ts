import type Phaser from 'phaser';
import { TILE } from '../layout';
import { FOG_SHEET, SHEET_COLS } from './sheets';
import { neighbourKey } from './terrainArt';

/**
 * Niebla de guerra del dibujo nuevo: velo azul oscuro con el borde tramado. Las piezas estan
 * precompiladas en blob/fog.png (tools/art/build_sheets.py); aqui solo se colocan segun lo que se ve.
 */
export function composeFog(vis: boolean[][], textures: Phaser.Textures.TextureManager, cv?: HTMLCanvasElement): HTMLCanvasElement {
  const W = vis.length,
    H = vis[0]!.length;
  if (!cv) cv = document.createElement('canvas');
  if (cv.width !== W * TILE || cv.height !== H * TILE) {
    cv.width = W * TILE;
    cv.height = H * TILE;
  }
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!textures.exists('blob/fog')) return cv;
  const f = textures.getFrame('blob/fog');
  const img = f.source.image as CanvasImageSource;
  // Fuera del mapa cuenta como la casilla mas cercana.
  const hid = (x: number, y: number) => !vis[Math.min(W - 1, Math.max(0, x))]![Math.min(H - 1, Math.max(0, y))]!;
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++) {
      const i = FOG_SHEET[neighbourKey(x, y, hid)]!;
      if (i < 0) continue;
      ctx.drawImage(img, f.cutX + (i % SHEET_COLS) * TILE, f.cutY + Math.floor(i / SHEET_COLS) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
    }
  return cv;
}

/** Firma de una matriz de visibilidad (para no repintar si no cambia). */
export function visKey(vis: boolean[][]): string {
  let s = '';
  for (const col of vis) for (const v of col) s += v ? '1' : '0';
  return s;
}
