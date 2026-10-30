/**
 * Atajos para editar el contenido del juego (src/core/content).
 *
 *   npm run unit -- new Sniper --like Soldier
 *
 * Añade la unidad al final de units.json copiando la que se diga (numeros, quien la ataca y con cuanto
 * acierto, transportes y suministros) y con su dibujo prestado. Despues: nombre, numeros y dibujo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { validateContent, readContentFiles, type UnitDef } from '../../src/core/content';
import { addUnitLike } from './newUnit';

const FILE = fileURLToPath(new URL('../../src/core/content/units.json', import.meta.url));

async function main(): Promise<void> {
  const [cmd, id, ...rest] = process.argv.slice(2);
  const like = rest[rest.indexOf('--like') + 1];
  if (cmd !== 'new' || !id || !rest.includes('--like') || !like) {
    console.log('Uso: npm run unit -- new <Id> --like <UnidadParecida>');
    process.exit(1);
  }
  const file = JSON.parse(readFileSync(FILE, 'utf8')) as { $schema: string; units: UnitDef[] };
  const { units, copied } = addUnitLike(file.units, id, like);
  const errs = validateContent({ ...readContentFiles(), units });
  if (errs.length) throw new Error(`La unidad nueva no valida:\n- ${errs.join('\n- ')}`);
  const json = JSON.stringify({ ...file, units }, null, 2);
  writeFileSync(FILE, await format(json, { ...(await resolveConfig(FILE)), filepath: FILE }));
  console.log(`Añadida "${id}" (copia de ${like}) al final de src/core/content/units.json.
- Le pueden atacar como a ${like}: ${copied.attackers.join(', ') || 'nadie'}.
- La llevan: ${copied.carriers.join(', ') || 'nadie'}. La recargan: ${copied.suppliers.join(', ') || 'nadie'}.

Falta:
1. name (es/en), precio y numeros; su "attack.hitChance" y el acierto de cada una contra ella.
2. Dibujo: u/b_${id}, u/i_${id}, u/r_${id} (skill arte-retro-diffusion) y quitar "art".
3. Equilibrio: npm run balance -- duel y skill equilibrar; despues npx vitest run -u tests/aiGolden.test.ts.
4. CHANGELOG y npm run check. Guia completa: docs/CONTENIDO.md.`);
}

await main();
