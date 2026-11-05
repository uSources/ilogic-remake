import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { PLAIN_RULES } from './plainRules';
import { duelMatrix } from '../tools/balance/duel';
import { playGame } from '../tools/balance/play';
import { runDuels, runGames } from '../tools/balance/runner';
import { buildVariant } from '../tools/balance/variant';
import { entryOf, type GameContent } from '@core/content';

const TANK_INDEX = defaultContent().units.list.findIndex((unitType) => unitType.id === 'Tank');
const tankOf = (content: GameContent) => entryOf(content.units, 'Tank', 'unidad');
const TANK = tankOf(defaultContent());

describe('herramienta de equilibrio: variantes', () => {
  it('construye otro contenido y otras reglas por nombre, indice, comodin y operaciones', () => {
    const setup = buildVariant(
      {
        name: 't',
        set: {
          'RULES.counterattack': false,
          'UNIT.cost.Tank': 9000,
          'UNIT.move.0': 4,
          'HIT_CHANCE.Tank.Soldier': '+0.1',
          'UNIT.cost.*': 'x2',
          'RULES.fog': false,
          'RULES.initialFunds': 'x2',
        },
      },
      defaultContent(),
    );
    const variant = setup.content;
    expect(tankOf(variant).cost).toBe(18000);
    expect(variant.units.list[0]!.move).toBe(4);
    expect(tankOf(variant).attack!.hitChance.Soldier).toBeCloseTo(TANK.attack!.hitChance.Soldier! + 0.1);
    expect(rulesWith(setup.content)).toMatchObject({
      counterattack: false,
      fog: false,
      initialFunds: defaultContent().defaultRules.initialFunds * 2,
    });
    expect(setup.changes.length).toBeGreaterThan(20);
  });

  it('el contenido y las reglas en uso no cambian: estan congelados', () => {
    const tankCost = TANK.cost;
    buildVariant({ name: 't', set: { 'UNIT.cost.Tank': 1, 'RULES.fog': false } }, defaultContent());
    expect(TANK.cost).toBe(tankCost);
    expect(defaultContent().defaultRules.fog).toBe(true);
    expect(Object.isFrozen(TANK)).toBe(true);
    expect(Object.isFrozen(TANK.attack!.hitChance)).toBe(true);
    expect(Object.isFrozen(defaultContent().defaultRules)).toBe(true);
    expect(() => {
      (TANK as { cost: number }).cost = 1;
    }).toThrow(TypeError);
  });

  it('cambia los ficheros y los vuelve a cargar: ficheros, tablas y reglas cuadran', () => {
    const setup = buildVariant(
      { name: 'v', set: { 'UNIT.cost.Tank': 9000, 'MOVE_COST.vehicle.Woods': null, 'RULES.upkeep': 0.2, 'AI.KILLBONUS': 7 } },
      defaultContent(),
    );
    const variant = setup.content;
    const woodsOf = (content: GameContent) => entryOf(content.terrain, 'Woods', 'terreno');
    expect(variant.files.units[TANK_INDEX]!.cost).toBe(9000);
    expect(tankOf(variant).cost).toBe(9000);
    // Los tipos resueltos (el terreno con su coste por movimiento) tambien se rehacen.
    expect(variant.files.terrain.find((terrain) => terrain.id === 'Woods')!.movement.vehicle).toBeNull();
    expect(woodsOf(variant).moveCost.vehicle).toBeNull();
    expect(woodsOf(defaultContent()).moveCost.vehicle).not.toBeNull();
    expect(rulesWith(setup.content).upkeep).toBe(0.2);
    expect(variant.ai.KILLBONUS).toBe(7);
    expect(Object.isFrozen(variant.files.units[TANK_INDEX])).toBe(true);
  });

  it('un valor que el contenido no admite para antes de jugar (lo valida loadContent)', () => {
    expect(() => buildVariant({ name: 'x', set: { 'UNIT.cost.Tank': -5 } }, defaultContent())).toThrow(/cost/);
    expect(() => buildVariant({ name: 'x', set: { 'RULES.upkeep': 'x100' } }, defaultContent())).toThrow(/upkeep/);
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
    const first = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'], rules: rulesWith(defaultContent()), content: defaultContent() });
    const second = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'], rules: rulesWith(defaultContent()), content: defaultContent() });
    expect(first).toEqual(second);
    expect(first.samples.length).toBeGreaterThan(5);
    expect(first.units[0]!.reduce((sum, unitTally) => sum + unitTally.bought, 0)).toBeGreaterThan(0);
  });

  it('duelos: sin contraataque el defensor no devuelve daño; con el, si', () => {
    const classic = duelMatrix({ trials: 20, terrain: 'Grass', seed: 1, rules: PLAIN_RULES, content: defaultContent() }).find(
      (cell) => cell.attacker === 'Tank' && cell.defender === 'Tank',
    )!;
    expect(classic.damage).toBeGreaterThan(0);
    expect(classic.counter).toBe(0);
    const modern = duelMatrix({
      trials: 20,
      terrain: 'Grass',
      seed: 1,
      rules: defaultContent().defaultRules,
      content: defaultContent(),
    }).find((cell) => cell.attacker === 'Tank' && cell.defender === 'Tank')!;
    expect(modern.counter).toBeGreaterThan(0);
    // La artilleria no recibe contraataque.
    const art = duelMatrix({
      trials: 5,
      terrain: 'Grass',
      seed: 1,
      rules: defaultContent().defaultRules,
      content: defaultContent(),
    }).find((cell) => cell.attacker === 'Artillery' && cell.defender === 'Tank')!;
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
        (cell) => cell.attacker === 'Tank' && cell.defender === 'Tank',
      );
    expect((await tankVsTank({}))!.damage).toBeGreaterThan(0);
    // Sin poder de tanque contra tanque, ese duelo ni se juega.
    expect(await tankVsTank({ 'HIT_CHANCE.Tank.Tank': 0 })).toBeUndefined();
  }, 30_000);
});
