/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { LOOSE_IMAGES } from './src/atlasPages.ts';

/**
 * Las imagenes sueltas de public/assets/img son el material de partida: el juego usa el atlas
 * (public/assets/atlas, npm run assets). En dist solo se dejan las que se cargan sueltas (los iconos
 * de la app van aparte, en public/icons).
 */
function pruneLooseImages(): Plugin {
  const keep = new Set(LOOSE_IMAGES.map((k) => `${k}.png`));
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

/** Linea de public/sw.js que se cambia por la version real (la misma que trae el fichero). */
export const SW_BUILD_LINE = "const BUILD = { version: 'dev', precache: [] };";

/**
 * PWA: escribe en dist/sw.js la version (hash del contenido) y la lista de ficheros que guarda al
 * instalarse, para jugar sin conexion. Va todo menos la musica (se guarda al sonar; hay .ogg y .mp3
 * y el navegador solo usa uno), las letras .woff (los navegadores actuales usan .woff2) y el propio
 * service worker. Corre despues de pruneLooseImages.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ilogic-pwa',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      (function walk(dir: string) {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).replace(/\\/g, '/'));
        }
      })(outDir);
      const precache = files
        .filter((f) => f !== 'sw.js' && !f.startsWith('assets/music/') && !f.endsWith('.woff') && !f.startsWith('.'))
        .sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = join(outDir, 'sw.js');
      const src = readFileSync(sw, 'utf8');
      if (!src.includes(SW_BUILD_LINE)) throw new Error(`public/sw.js ya no tiene la linea: ${SW_BUILD_LINE}`);
      const line = `const BUILD = ${JSON.stringify({ version, precache: ['./', ...precache] })};`;
      writeFileSync(sw, src.replace(SW_BUILD_LINE, line));
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  repository?: { url?: string };
};
/** "usuario/repo" a partir de package.json "repository" (las notas de parche salen de sus Releases). */
const repo = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(pkg.repository?.url ?? '')?.[1] ?? '';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __NOTES_REPO__: JSON.stringify(repo) },
  base: './',
  // Las herramientas y los tests importan el nucleo como '@core/...' (ver tsconfig.json "paths").
  resolve: { alias: { '@core': fileURLToPath(new URL('./src/core', import.meta.url)) } },
  plugins: [preact(), pruneLooseImages(), serviceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});
