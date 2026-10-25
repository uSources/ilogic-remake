// Genera src/assetList.ts con todas las imagenes de public/assets/img.
// Ejecutar: node scripts/gen-assets.mjs
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../public/assets/img/', import.meta.url).pathname;
const keys = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.png')) keys.push(relative(root, full).replace(/\\/g, '/').slice(0, -4));
  }
})(root);
writeFileSync(
  new URL('../src/assetList.ts', import.meta.url),
  `// Generado por scripts/gen-assets.mjs. No editar a mano.\n` +
    `// Clave = ruta relativa a public/assets/img sin ".png".\n` +
    `export const IMAGE_KEYS: readonly string[] = ${JSON.stringify(keys, null, 2)};\n`,
);
console.log(`${keys.length} imagenes`);
