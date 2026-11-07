import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { ESLint, Linter } from 'eslint';
import {
  APPLY_STEPS,
  APPLY_STEP_NAMES,
  DECIDERS_ONLY_PROPOSE,
  NO_PLUGGED_PIECES_EXCEPT_POWERS,
  ONLY_THROUGH_RULE_MODULES,
} from '../eslint.config.js';
import * as rulesFacade from '@core/rules';
import * as squadsFacade from '@core/squads';
import * as actionsFacade from '@core/actions';
import { stateWriters } from './stateWriters';

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
    "import { turnSeedOf } from '../turnSeeds';",
    "import { turnSeedOf } from '@core/turnSeeds';",
  ])('prohibe %s', (code) => expect(forbidsCode(`${code}\nexport const used = 1;\n`)).toBe(true));

  it.each([
    "import { actorProblem } from '../actions/checks';",
    "import { carryOut } from '../actions/plan';",
    "import { foggedCopy, seeing } from '../playerView';",
    "import { decisionRngOf } from '../playerView';",
  ])('deja %s', (code) => expect(forbidsCode(`${code}\nexport const used = 1;\n`)).toBe(false));

  it('la configuracion de verdad lo pone en la IA y en autopilot/', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
    for (const file of ['src/core/ai/tactics.ts', 'src/core/ai.ts', 'src/core/ai/general.ts', 'src/core/autopilot/tactics.ts']) {
      const config = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> };
      const options = config.rules?.['no-restricted-imports']?.[1] as { patterns?: object[] } | undefined;
      for (const pattern of DECIDERS_ONLY_PROPOSE) expect(options?.patterns ?? []).toContainEqual(pattern);
    }
  });
});

/** ESTILO, regla 12: los pasos que cambian la partida (en rules/ y squads/) solo los llaman las acciones, las fases y las INVARIANTS. */
describe('los pasos que cambian la partida no se usan para decidir ni mirar (APPLY_STEPS, eslint.config.js)', () => {
  const forbidsIn = (filename: string, code: string): boolean =>
    linter
      .verify(
        `${code}\nexport const used = 1;\n`,
        [{ rules: { 'no-restricted-imports': ['error', { patterns: APPLY_STEPS }] } }] as Linter.Config[],
        {
          filename,
        },
      )
      .some((message) => message.ruleId === 'no-restricted-imports');

  it.each([
    "import { earn } from '../rules/funds';",
    "import { pay } from '../rules/funds.ts';",
    "import { advanceCapture } from '../rules/capture';",
    "import { traverse } from '../rules/traverse';",
    "import { spendUnit } from '../rules/unitTurn';",
    "import { giveStandingOrder } from '../squads/standingOrderSteps';",
    "import { formSquad } from '../squads/membership';",
    "import { endRound } from '../rules/round';",
    "import { advanceWeather, ensureWeather } from '../weather';",
    "import { applyPower } from '../generalPowers';",
    "import { appointGeneral, chargeFromCombat, generalsNewRound } from '../generals';",
    "import { recordEvents, recordEvent, sampleArmy } from '../stats.ts';",
  ])('prohibe %s a quien decide', (code) => expect(forbidsIn('src/core/ai/example.js', code)).toBe(true));

  it.each([
    "import { endsInterrupted } from '../rules/traverse';",
    "import { captureProgress } from '../rules/capture';",
    "import { canStillAct } from '../rules/unitTurn';",
    "import { effectiveStandingOrder } from '../squads/standingOrderQueries';",
    "import { assistTurn } from '../autopilot/standingOrders';",
    "import { weatherNow } from '../weather';",
    "import { armyValue } from '../stats';",
    "import { generalOf } from '../generals';",
  ])('deja %s', (code) => expect(forbidsIn('src/core/ai/example.js', code)).toBe(false));

  it('la configuracion de verdad lo pone en quien decide, la sesion, los controladores y la vista', async () => {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
    const files = [
      'src/core/ai/tactics.ts',
      'src/core/autopilot/tactics.ts',
      'src/core/session/gameSession.ts',
      'src/core/controllers/aiController.ts',
      'src/core/playerView.ts',
      'src/core/targeting.ts',
    ];
    for (const file of files) {
      const config = (await eslint.calculateConfigForFile(file)) as { rules?: Record<string, unknown[]> };
      const options = config.rules?.['no-restricted-imports']?.[1] as { patterns?: object[] } | undefined;
      for (const pattern of APPLY_STEPS) expect(options?.patterns ?? [], file).toContainEqual(pattern);
    }
  });

  /**
   * Lo que cambia la partida pero no es un paso de APPLY_STEPS, y por que quien decide ya no lo puede
   * usar (o no le sirve): crear o cargar una partida escribe en la que se esta creando, y lo demas lo
   * prohiben otras reglas de eslint.config.js.
   */
  const NOT_STEPS: Readonly<Record<string, string>> = {
    'core/savedParts.ts#cleanCounters': 'limpia una partida que se esta leyendo',
    'core/savedParts.ts#cleanOptionalParts': 'limpia una partida que se esta leyendo',
    'core/save.ts#readSave': 'carga una partida nueva',
    'core/save.ts#deserialize': 'carga una partida nueva',
    'core/defaultGames.ts#createMatch': 'crea una partida nueva',
    'core/defaultGames.ts#loadGame': 'carga una partida nueva',
    'core/match.ts#buildMatch': 'crea una partida nueva',
    'core/missions/build.ts#buildMission': 'crea una partida nueva',
    'core/mapgen/buildings.ts#placeStartingUnits': 'el generador de mapas, en la partida que crea',
    'core/mapgen/buildings.ts#placeStartingBuildings': 'el generador de mapas, en la partida que crea',
    'core/mapgen/buildings.ts#placeNeutralBuildings': 'el generador de mapas, en la partida que crea',
    'core/mapgen/controlPoints.ts#placeControlPoints': 'el generador de mapas, en la partida que crea',
    'core/dice.ts#diceOf': 'tira los dados de la partida: DECIDERS_ONLY_PROPOSE',
    'core/actions/dispatch.ts#dispatch': 'manda una accion: DECIDERS_ONLY_PROPOSE',
    'core/actions/combat.ts#resolveAttack': 'el combate sin comprobar: UNCHECKED_ATTACK_ONLY_IN_MEASURE',
    'core/measure.ts#uncheckedAttack': 'solo para medir: MEASURING_IS_NOT_THE_GAME',
    'core/autopilot/preview.ts#plannedStandingOrders': 'simula en su propia copia de la partida (foggedCopy)',
    'core/autopilot/preview.ts#previewStandingOrders': 'simula en su propia copia de la partida (foggedCopy)',
  };

  it('toda funcion del nucleo que cambia la partida esta en APPLY_STEPS (o se sabe por que no): la lista no se queda atras', () => {
    const files = readdirSync('src/core', { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.startsWith('model/'))
      .map((file) => `src/core/${file}`);
    const found = stateWriters(files)
      .map(({ file, name }) => ({ id: `${file.replace(/^src\//, '')}#${name}`, name }))
      .filter(({ id, name }) => !APPLY_STEP_NAMES.includes(name) && !(id in NOT_STEPS))
      .map(({ id }) => id);
    expect(found).toEqual([]);
  }, 60_000);

  it('la busqueda ve lo que cambia la partida: directamente, en un campo guardado en una variable y a traves de un gancho', () => {
    const found = stateWriters(['src/core/weather.ts', 'src/core/stats.ts', 'src/core/rules/funds.ts']).map(({ name }) => name);
    expect(found).toEqual(
      expect.arrayContaining(['ensureWeather', 'advanceWeather', 'sampleArmy', 'recordEvent', 'recordEvents', 'earn', 'pay']),
    );
    expect(found).not.toContain('weatherNow');
    expect(found).not.toContain('armyValue');
  }, 60_000);

  it('las fachadas del nucleo no dan ninguno: fuera del nucleo la partida solo cambia con acciones', () => {
    const exported = [...Object.keys(rulesFacade), ...Object.keys(squadsFacade), ...Object.keys(actionsFacade)];
    expect(exported.filter((name) => APPLY_STEP_NAMES.includes(name))).toEqual([]);
  });
});
