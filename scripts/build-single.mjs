// Genera dist-single/ilogic.html: el juego entero en un solo fichero HTML
// (JavaScript, imagenes y musica incrustados). Ejecutar despues de "vite build":
//   npm run build && node scripts/build-single.mjs
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const dist = process.argv[2] ? resolve(process.argv[2]) : new URL('../dist/', import.meta.url).pathname;
const assets = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(png|ogg|mp3)$/.test(name)) {
      const rel = relative(dist, full).replace(/\\/g, '/');
      const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg';
      assets[rel] = `data:${mime};base64,${readFileSync(full).toString('base64')}`;
    }
  }
})(join(dist, 'assets'));

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const m = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
if (!m) throw new Error('No encuentro el script en dist/index.html');
const js = readFileSync(join(dist, m[1]), 'utf8').replace(/<\/script/g, '<\\/script');
// Hoja de estilos con las fuentes incrustadas (solo woff2: todos los navegadores actuales lo leen).
const cssLink = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
if (!cssLink) throw new Error('No encuentro la hoja de estilos en dist/index.html');
const cssDir = join(dist, cssLink[1], '..');
const css = readFileSync(join(dist, cssLink[1]), 'utf8')
  .replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, '')
  .replace(/url\(([^)]+\.woff2)\)/g, (_, u) => {
    const file = join(cssDir, u.replace(/^["']|["']$/g, ''));
    return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`;
  });
html = html
  .replace(m[0], '')
  .replace(cssLink[0], `<style>${css}</style>`)
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/png" href="${assets['assets/img/b_Soldier.png']}" />`)
  .replace(
    '</body>',
    `<script>window.__ILOGIC_ASSETS__=${JSON.stringify(assets)};</script>\n<script type="module">${js}</script>\n</body>`,
  );
mkdirSync(new URL('../dist-single/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-single/ilogic.html', import.meta.url), html);
console.log(`dist-single/ilogic.html: ${(html.length / 1024 / 1024).toFixed(1)} MB, ${Object.keys(assets).length} recursos`);
