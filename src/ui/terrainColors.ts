import type Phaser from 'phaser';
import { TERRAIN_TYPES } from '../core/content';
import { terrainKey } from './sprites';
import { drawFrame, hasImage } from '../atlas';

let cache: number[] | null = null;

/** Color medio de cada imagen de terreno (para minimapas y miniaturas). */
export function terrainPalette(textures: Phaser.Textures.TextureManager): number[] {
  if (cache) return cache;
  const out: number[] = [];
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  for (let i = 0; i < TERRAIN_TYPES; i++) {
    let color = 0x3a7a3a;
    const key = terrainKey(i);
    if (hasImage(textures, key)) {
      ctx.clearRect(0, 0, 8, 8);
      drawFrame(ctx, textures, key, 0, 0, 8, 8);
      const pixels = ctx.getImageData(0, 0, 8, 8).data;
      let red = 0,
        green = 0,
        blue = 0,
        count = 0;
      for (let offset = 0; offset < pixels.length; offset += 4)
        if (pixels[offset + 3]! > 0) {
          red += pixels[offset]!;
          green += pixels[offset + 1]!;
          blue += pixels[offset + 2]!;
          count++;
        }
      if (count) color = (Math.round(red / count) << 16) | (Math.round(green / count) << 8) | Math.round(blue / count);
    }
    out.push(color);
  }
  // Solo se guarda si ya estaban cargadas las imagenes.
  if (hasImage(textures, terrainKey(0))) cache = out;
  return out;
}
