import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { PLAIN_RULES } from './plainRules';
import { duelMatrix } from '../tools/balance/duel';
import { playGame } from '../tools/balance/play';
import { runDuels, runGames } from '../tools/balance/runner';
import { buildVariant } from '../tools/balance/variant';

const { UNIT, UNIT_NAMES, POWER } = defaultContent().tables;

const TANK = UNIT_NAMES.indexOf('Tank');
const SOLDIER = UNIT_NAMES.indexOf('Soldier');

describe('herramienta de equilibrio: variantes', () => {
  it('construye otro contenido y otras reglas por nombre, indice, comodin y operaciones', () => {
    const setup = buildVariant(
      {
        name: 't',
        set: {
          'RULES.counterattack': false,
          'UNIT.cost.Tank': 9000,
          'UNIT.mover.0': 4,
          'POWER.Tank.Soldier': '+0.1',
          'UNIT.cost.*': 'x2',
          'RULES.fog': false,
          'RULES.initialFunds': 'x2',
        },
      },
      defaultContent(),
    );
    const tables = setup.content.tables;
    expect(tables.UNIT.cost[TANK]).toBe(18000);
    expect(tables.UNIT.mover[0]).toBe(4);
    expect(tables.POWER[TANK]![SOLDIER]).toBeCloseTo(POWER[TANK]![SOLDIER]! + 0.1);
    expect(setup.rules).toMatchObject({
      counterattack: false,
      fog: false,
      initialFunds: defaultContent().tables.DEFAULT_RULES.initialFunds * 2,
    });
    expect(setup.changes.length).toBeGreaterThan(20);
  });

  it('el contenido y las reglas en uso no cambian: estan congelados', () => {
    const tankCost = UNIT.cost[TANK];
    buildVariant({ name: 't', set: { 'UNIT.cost.Tank': 1, 'RULES.fog': false } }, defaultContent());
    expect(UNIT.cost[TANK]).toBe(tankCost);
    expect(defaultContent().tables.DEFAULT_RULES.fog).toBe(true);
    expect(Object.isFrozen(UNIT.cost)).toBe(true);
    expect(Object.isFrozen(POWER[TANK])).toBe(true);
    expect(Object.isFrozen(defaultContent().tables.DEFAULT_RULES)).toBe(true);
    expect(() => {
      (UNIT.cost as number[])[TANK] = 1;
    }).toThrow(TypeError);
  });

  it('avisa de rutas o valores no validos', () => {
    expect(() => buildVariant({ name: 'x', set: { 'UNIT.cost.Dragon': 1 } }, defaultContent())).toThrow(/Dragon/);
    expect(() => buildVariant({ name: 'x', set: { 'NADA.cost': 1 } }, defaultContent())).toThrow(/Tabla/);
    expect(() => buildVariant({ name: 'x', set: { 'UNIT.cost': 1 } }, defaultContent())).toThrow(/tabla entera/);
    expect(() => buildVariant({ name: 'x', set: { 'UNIT.cost.Tank': 'mucho' } }, defaultContent())).toThrow(/no valido/);
    expect(() => buildVariant({ name: 'x', set: { 'RULES.nada': 1 } }, defaultContent())).toThrow(/nada/);
  });
});

describe('herramienta de equilibrio: partidas y duelos', () => {
  it('la misma semilla da la misma partida', () => {
    const a = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'], rules: rulesWith(defaultContent()), content: defaultContent() });
    const b = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'], rules: rulesWith(defaultContent()), content: defaultContent() });
    expect(a).toEqual(b);
    expect(a.samples.length).toBeGreaterThan(5);
    expect(a.units[0]!.reduce((n, t) => n + t.bought, 0)).toBeGreaterThan(0);
  });

  it('duelos: sin contraataque el defensor no devuelve daño; con el, si', () => {
    const classic = duelMatrix({ trials: 20, terrain: 'Grass', seed: 1, rules: PLAIN_RULES, content: defaultContent() }).find(
      (c) => c.attacker === 'Tank' && c.defender === 'Tank',
    )!;
    expect(classic.damage).toBeGreaterThan(0);
    expect(classic.counter).toBe(0);
    const modern = duelMatrix({
      trials: 20,
      terrain: 'Grass',
      seed: 1,
      rules: defaultContent().tables.DEFAULT_RULES,
      content: defaultContent(),
    }).find((c) => c.attacker === 'Tank' && c.defender === 'Tank')!;
    expect(modern.counter).toBeGreaterThan(0);
    // La artilleria no recibe contraataque.
    const art = duelMatrix({
      trials: 5,
      terrain: 'Grass',
      seed: 1,
      rules: defaultContent().tables.DEFAULT_RULES,
      content: defaultContent(),
    }).find((c) => c.attacker === 'Artillery' && c.defender === 'Tank')!;
    expect(art.counter).toBe(0);
  });
});

describe('herramienta de equilibrio: cada hilo juega con el contenido de su variante', () => {
  it('con todo carisimo nadie compra; con el contenido de siempre, si', async () => {
    const bought = async (set: Record<string, string>) => {
      const [game] = await runGames(buildVariant({ name: 'v', set }, defaultContent()), [5], 6, ['ai', 'ai'], 1);
      return game!.units.flat().reduce((total, tally) => total + tally.bought, 0);
    };
    expect(await bought({})).toBeGreaterThan(0);
    expect(await bought({ 'UNIT.cost.*': 'x1000' })).toBe(0);
  }, 30_000);

  it('los duelos tambien', async () => {
    const tankVsTank = async (set: Record<string, number>) =>
      (await runDuels(buildVariant({ name: 'v', set }, defaultContent()), { trials: 20, terrain: 'Grass', seed: 1 })).find(
        (c) => c.attacker === 'Tank' && c.defender === 'Tank',
      );
    expect((await tankVsTank({}))!.damage).toBeGreaterThan(0);
    // Sin poder de tanque contra tanque, ese duelo ni se juega.
    expect(await tankVsTank({ 'POWER.Tank.Tank': 0 })).toBeUndefined();
  }, 30_000);
});
