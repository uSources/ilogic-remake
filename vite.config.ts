/// <reference types="vitest/config" />
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { LOOSE_IMAGES } from './src/atlasPages.ts';

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

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
/** "usuario/repo" a partir de package.json "repository" (las notas de parche salen de sus Releases). */
const repo = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(pkg.repository?.url ?? '')?.[1] ?? '';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __NOTES_REPO__: JSON.stringify(repo) },
  base: './',
  plugins: [preact(), pruneLooseImages()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});
