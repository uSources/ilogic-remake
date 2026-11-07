import { describe, expect, it } from 'vitest';
import { ESLint, Linter } from 'eslint';
import { DECIDERS_ONLY_PROPOSE, NO_PLUGGED_PIECES_EXCEPT_POWERS, ONLY_THROUGH_RULE_MODULES } from '../eslint.config.js';

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
  '../rules',
  '../rules.ts',
  '@core/rules',
  '../../core/rules',
  '../actions',
  '@core/actions',
  '../index',
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

  it('la configuracion de verdad pone el patron en las reglas y las acciones, y el de la excepcion en la lista de acciones', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
    const patternsFor = async (file: string) => {
      const config = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> };
      const options = config.rules?.['no-restricted-imports']?.[1] as { patterns?: object[] } | undefined;
      return options?.patterns ?? [];
    };
    expect(await patternsFor('src/core/rules/combat.ts')).toContainEqual(ONLY_THROUGH_RULE_MODULES);
    expect(await patternsFor('src/core/actions/movement.ts')).toContainEqual(ONLY_THROUGH_RULE_MODULES);
    const actionList = await patternsFor('src/core/actions/registry.ts');
    expect(actionList).toContainEqual(NO_PLUGGED_PIECES_EXCEPT_POWERS);
    expect(actionList).not.toContainEqual(ONLY_THROUGH_RULE_MODULES);
  });
});

/** I1/I2: la IA y autopilot/ solo proponen acciones y solo leen la vista que les dan. */
describe('quien decide solo propone (DECIDERS_ONLY_PROPOSE, eslint.config.js)', () => {
  /** Si alguna de las reglas prohibe `code` en un fichero de la IA. */
  const forbidsCode = (code: string): boolean =>
    linter
      .verify(code, [{ rules: { 'no-restricted-imports': ['error', { patterns: DECIDERS_ONLY_PROPOSE }] } }] as Linter.Config[], {
        filename: 'src/core/ai/example.js',
      })
      .some((message) => message.ruleId === 'no-restricted-imports');

  it.each([
    "import { dispatch } from '../actions/dispatch';",
    "import { dispatch } from '../actions';",
    "import { dispatch } from '@core/actions';",
    "import { GameSession } from '../session';",
    "import { GameSession } from '../session/gameSession';",
    "import { playerView } from '../playerView';",
    "import { diceOf } from '../dice';",
  ])('prohibe %s', (code) => expect(forbidsCode(`${code}\nexport const used = 1;\n`)).toBe(true));

  it.each([
    "import { actorProblem } from '../actions/checks';",
    "import { carryOut } from '../actions/plan';",
    "import { seeing, unitsKnownTo } from '../playerView';",
    "import { decisionRng } from '../dice';",
  ])('deja %s', (code) => expect(forbidsCode(`${code}\nexport const used = 1;\n`)).toBe(false));

  it('la configuracion de verdad lo pone en la IA y en autopilot/', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
    for (const file of ['src/core/ai/tactics.ts', 'src/core/ai.ts', 'src/core/aiGenerals.ts', 'src/core/autopilot/tactics.ts']) {
      const config = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> };
      const options = config.rules?.['no-restricted-imports']?.[1] as { patterns?: object[] } | undefined;
      for (const pattern of DECIDERS_ONLY_PROPOSE) expect(options?.patterns ?? []).toContainEqual(pattern);
    }
  });
});
