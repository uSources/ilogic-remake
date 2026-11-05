import type Phaser from 'phaser';
import { defaultContent } from '../core/content/default';
import { terrainKey } from './sprites';
import { drawFrame, hasImage } from '../atlas';

/** Color medio de cada terreno, por id de terreno (terrain.json). */
export type TerrainPalette = Readonly<Record<string, number>>;

let cache: TerrainPalette | null = null;

/** Color medio de cada imagen de terreno del juego (para minimapas y miniaturas). */
export function terrainPalette(textures: Phaser.Textures.TextureManager): TerrainPalette {
  if (cache) return cache;
  const out: Record<string, number> = {};
  const cv = document.createElement('canvas');
  cv.width = cv.height = 8;
  const context = cv.getContext('2d', { willReadFrequently: true })!;
  const terrains = defaultContent().terrain.list;
  for (const terrain of terrains) {
    let color = 0x3a7a3a;
    const key = terrainKey(terrain);
    if (hasImage(textures, key)) {
      context.clearRect(0, 0, 8, 8);
      drawFrame(context, textures, key, 0, 0, 8, 8);
      const pixels = context.getImageData(0, 0, 8, 8).data;
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
    out[terrain.id] = color;
  }
  // Solo se guarda si ya estaban cargadas las imagenes.
  if (hasImage(textures, terrainKey(terrains[0]!))) cache = out;
  return out;
}
