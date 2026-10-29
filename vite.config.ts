/// <reference types="vitest/config" />
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { LOOSE_IMAGES } from './src/atlasPages';

/**
 * Las imagenes sueltas de public/assets/img son el material de partida: el juego usa el atlas
 * (public/assets/atlas, npm run assets). En dist solo se dejan las que se cargan sueltas y el icono.
 */
function pruneLooseImages(): Plugin {
  const keep = new Set([...LOOSE_IMAGES, 'b_Soldier'].map((k) => `${k}.png`));
  let outDir = 'dist';
  return {
    name: 'ilogic-prune-images',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const dir = join(outDir, 'assets', 'img');
      for (const name of readdirSync(dir)) if (!keep.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), pruneLooseImages()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});
