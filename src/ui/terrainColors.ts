import type Phaser from 'phaser';
import { TERRAIN } from '../core/data';
import { terrainKey } from './sprites';
import { drawFrame } from '../atlas';

let cache: number[] | null = null;

/** Color medio de cada imagen de terreno (para minimapas y miniaturas). */
export function terrainPalette(textures: Phaser.Textures.TextureManager): number[] {
  if (cache) return cache;
  const out: number[] = [];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  for (let i = 0; i < TERRAIN.protection.length; i++) {
    let color = 0x3a7a3a;
    const key = terrainKey(i);
    if (textures.exists(key)) {
      ctx.clearRect(0, 0, 8, 8);
      drawFrame(ctx, textures, key, 0, 0, 8, 8);
      const d = ctx.getImageData(0, 0, 8, 8).data;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let k = 0; k < d.length; k += 4)
        if (d[k + 3]! > 0) {
          r += d[k]!;
          g += d[k + 1]!;
          b += d[k + 2]!;
          n++;
        }
      if (n) color = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
    }
    out.push(color);
  }
  // Solo se guarda si ya estaban cargadas las imagenes.
  if (textures.exists(terrainKey(0))) cache = out;
  return out;
}
