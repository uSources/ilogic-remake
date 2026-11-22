// La lista de efectos que lee el juego (src/audio/soundList.ts), sacada de los WAV que hay en
// public/assets/sfx: <id>_<n>.wav, con n de 1 en adelante. La escriben las dos herramientas que hacen
// efectos, Ashfox (tools/art/ashfox/sounds.mjs) y la de IA (tools/audio): asi ninguna quita de la lista
// los de la otra, y la lista nunca pide un WAV que no esta.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
export const SFX_FOLDER = join(ROOT, 'public/assets/sfx');
const SOUND_LIST = join(ROOT, 'src/audio/soundList.ts');
const VARIANT_FILE = /^([a-z0-9_]+)_(\d+)\.wav$/;

/** Los numeros de variante que hay en la carpeta, por efecto. */
function variantNumbers() {
  const numbers = new Map();
  for (const file of readdirSync(SFX_FOLDER)) {
    const match = VARIANT_FILE.exec(file);
    if (!match) continue;
    const [, id, variant] = match;
    numbers.set(id, [...(numbers.get(id) ?? []), Number(variant)]);
  }
  return numbers;
}

/** Cuantas variantes seguidas (1, 2, 3...) tiene cada efecto, por orden alfabetico (el juego elige una al azar). */
export function variantCounts() {
  const counts = new Map();
  for (const [id, numbers] of variantNumbers()) {
    let count = 0;
    while (numbers.includes(count + 1)) count++;
    if (count > 0) counts.set(id, count);
  }
  return new Map([...counts].sort(([a], [b]) => a.localeCompare(b)));
}

export function writeSoundList() {
  const entries = [...variantCounts()].map(([id, count]) => `  ${id}: ${count},`);
  const text = [
    '// Generado por tools/audio/soundList.mjs desde los WAV de public/assets/sfx. No editar a mano.',
    '/** Los efectos de sonido (public/assets/sfx/<id>_<n>.wav) y cuantas variantes tiene cada uno. */',
    'export const SOUND_VARIANTS = {',
    ...entries,
    '} as const;',
    '',
  ].join('\n');
  writeFileSync(SOUND_LIST, text);
}
