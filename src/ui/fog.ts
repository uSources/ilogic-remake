import type Phaser from 'phaser';
import { hasImage, imageFrame } from '../atlas';
import type { Pos } from '../core/model';
import type { Grid } from '../core/util/grid';
import { TILE } from '../layout';
import { FOG_SHEET, SHEET_COLS } from './sheets';
import { neighbourKey } from './terrainArt';

/**
 * Niebla de guerra del dibujo nuevo: velo azul oscuro con el borde tramado. Las piezas estan
 * precompiladas en blob/fog.png (tools/art/build_sheets.py); aqui solo se colocan segun lo que se ve.
 */
export function composeFog(vis: Grid<boolean>, textures: Phaser.Textures.TextureManager, cv?: HTMLCanvasElement): HTMLCanvasElement {
  const width = vis.width,
    height = vis.height;
  if (!cv) cv = document.createElement('canvas');
  if (cv.width !== width * TILE || cv.height !== height * TILE) {
    cv.width = width * TILE;
    cv.height = height * TILE;
  }
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!hasImage(textures, 'blob/fog')) return cv;
  const frame = imageFrame(textures, 'blob/fog');
  const img = frame.source.image as CanvasImageSource;
  // Fuera del mapa cuenta como la casilla mas cercana.
  const hid = (pos: Pos) => !vis.atClamped(pos);
  for (const { pos } of vis.cells()) {
    const piece = FOG_SHEET[neighbourKey(pos, hid)]!;
    if (piece < 0) continue;
    const sourceX = frame.cutX + (piece % SHEET_COLS) * TILE;
    const sourceY = frame.cutY + Math.floor(piece / SHEET_COLS) * TILE;
    ctx.drawImage(img, sourceX, sourceY, TILE, TILE, pos.x * TILE, pos.y * TILE, TILE, TILE);
  }
  return cv;
}

/** Firma de una matriz de visibilidad (para no repintar si no cambia). */
export function visKey(vis: Grid<boolean>): string {
  let s = '';
  vis.forEach((isVisible) => (s += isVisible ? '1' : '0'));
  return s;
}
