import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import { NO_PLUGGED_PIECES_EXCEPT_POWERS, ONLY_THROUGH_RULE_MODULES } from '../eslint.config.js';

/**
 * La regla L7 de eslint.config.js (las reglas y las acciones no importan las piezas que se
 * enchufan): con cualquier forma de la ruta, y sin prohibir lo del contenido. Solo esa regla, sin
 * tipos, para que vaya rapido.
 */
const linter = new Linter({ configType: 'flat' });

/** Si la regla prohibe importar `path` (con el patron `pattern`). */
function forbids(pattern: object, path: string): boolean {
  const code = `import * as piece from '${path}';\nexport const used = piece;\n`;
  const config = [{ rules: { 'no-restricted-imports': ['error', { patterns: [pattern] }] } }] as Linter.Config[];
  return linter
    .verify(code, config, { filename: 'src/core/rules/example.js' })
    .some((message) => message.ruleId === 'no-restricted-imports');
}

const FORBIDDEN = [
  '../weather',
  './../weather',
  '../util/../weather',
  '../weather.js',
  '../weather.ts',
  '../generals',
  '../generalPowers',
  '../abilities',
  '../../core/weather',
  '@core/weather',
  '../ruleModules/registry',
  '../ruleModules/flank',
  '@core/ruleModules/registry',
  '../../core/ruleModules/registry',
  './../ruleModules/registry.js',
  '../ruleModules/hooks/../registry',
];
const ALLOWED = [
  '../ruleModules/ruleset',
  '../ruleModules/hooks',
  '@core/ruleModules/hooks',
  '../ruleModules/ruleset.js',
  '../content/abilities',
  '../model/weather',
  '@core/content/generals',
  './combat',
  '../damage',
];

describe('L7: las reglas y las acciones no importan las piezas que se enchufan (eslint.config.js)', () => {
  it.each(FORBIDDEN)('prohibe %s', (path) => expect(forbids(ONLY_THROUGH_RULE_MODULES, path)).toBe(true));
  it.each(ALLOWED)('deja %s', (path) => expect(forbids(ONLY_THROUGH_RULE_MODULES, path)).toBe(false));
  it('la lista de acciones puede juntar la accion de los poderes, y nada mas', () => {
    expect(forbids(NO_PLUGGED_PIECES_EXCEPT_POWERS, '../generalPowers')).toBe(false);
    expect(forbids(NO_PLUGGED_PIECES_EXCEPT_POWERS, '../weather')).toBe(true);
    expect(forbids(NO_PLUGGED_PIECES_EXCEPT_POWERS, '@core/ruleModules/flank')).toBe(true);
  });
});
