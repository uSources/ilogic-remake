// Genera dist-single/ilogic.html: el juego entero en un solo fichero HTML
// (JavaScript, imagenes y musica incrustados). Ejecutar despues de "vite build":
//   npm run build && node scripts/build-single.mjs
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { assetMimeType, singleFileHtml } from './singleFile.mjs';

const dist = process.argv[2] ? resolve(process.argv[2]) : new URL('../dist/', import.meta.url).pathname;
const assets = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const mime = assetMimeType(name);
    if (statSync(full).isDirectory()) walk(full);
    else if (mime) assets[relative(dist, full).replace(/\\/g, '/')] = `data:${mime};base64,${readFileSync(full).toString('base64')}`;
  }
})(join(dist, 'assets'));

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const favicon = `data:image/png;base64,${readFileSync(join(dist, 'icons', 'favicon-64.png')).toString('base64')}`;
const scriptTag = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/);
if (!scriptTag) throw new Error('No encuentro el script en dist/index.html');
const js = readFileSync(join(dist, scriptTag[1]), 'utf8');
// Hoja de estilos con las fuentes incrustadas (solo woff2: todos los navegadores actuales lo leen).
const cssLink = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
if (!cssLink) throw new Error('No encuentro la hoja de estilos en dist/index.html');
const cssDir = join(dist, cssLink[1], '..');
const css = readFileSync(join(dist, cssLink[1]), 'utf8')
  .replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, '')
  .replace(/url\(([^)]+\.woff2)\)/g, (_, url) => {
    const file = join(cssDir, url.replace(/^["']|["']$/g, ''));
    return `url(data:font/woff2;base64,${readFileSync(file).toString('base64')})`;
  });
const page = singleFileHtml({ html, scriptTag: scriptTag[0], styleTag: cssLink[0], css, js, assets, favicon });
mkdirSync(new URL('../dist-single/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist-single/ilogic.html', import.meta.url), page);
console.log(`dist-single/ilogic.html: ${(page.length / 1024 / 1024).toFixed(1)} MB, ${Object.keys(assets).length} recursos`);
