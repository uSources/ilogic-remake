import { describe, expect, it } from 'vitest';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { armyLimit, buyOptions, commandUsed, newUnit, upkeepOf } from '@core/rules';
import { dispatch } from '@core/actions';
import { blankState, unitTypeNamed, endRoundReport, withoutHeadquarters } from './helpers';
import { teamState } from '@core/teams';

const SOLDIER = unitTypeNamed('Soldier'),
  TANK = unitTypeNamed('Tank');
const CITY = 'City',
  FACTORY = 'Factory';

/** Reglas de las partidas de estos tests. */
const TEST_RULES = rulesWith(defaultContent(), { commandPoints: 10, upkeep: 0.1 });

describe('puntos de mando', () => {
  it('cada unidad ocupa los puntos de su tipo', () => {
    const s = blankState(TEST_RULES);
    newUnit(s, SOLDIER, 0, { x: 1, y: 1 });
    newUnit(s, TANK, 0, { x: 2, y: 2 });
    newUnit(s, TANK, 1, { x: 3, y: 3 });
    expect(commandUsed(s, 0)).toBe(SOLDIER.command + TANK.command);
  });

  it('no se puede comprar si la unidad no cabe, aunque haya dinero', () => {
    const s = blankState(TEST_RULES);
    teamState(s, 0).funds = 100000;
    const factory = { type: FACTORY, owner: 0 as const, x: 4, y: 4 };
    s.buildings.push(factory);
    newUnit(s, TANK, 0, { x: 1, y: 1 });
    newUnit(s, TANK, 0, { x: 2, y: 2 }); // 8 de 10
    expect(armyLimit(s, 0, TANK)).toBe('command');
    expect(buyOptions(s, factory).find((buyOption) => buyOption.unitType === TANK)?.blocked).toBe('command');
    expect(dispatch(s, 0, { kind: 'buy', at: factory, unitType: TANK.id })).toEqual({ ok: false, reason: 'command' });
    expect(teamState(s, 0).funds).toBe(100000);
    // Lo pequeño si cabe.
    const city = { type: CITY, owner: 0 as const, x: 6, y: 6 };
    s.buildings.push(city);
    expect(buyOptions(s, city).find((buyOption) => buyOption.unitType === SOLDIER)?.affordable).toBe(true);
    expect(dispatch(s, 0, { kind: 'buy', at: city, unitType: SOLDIER.id }).ok).toBe(true);
  });

  it('sin la regla solo cuenta el limite de unidades', () => {
    const s = blankState(rulesWith(defaultContent(), { commandPoints: null, maxUnits: 2 }));
    newUnit(s, TANK, 0, { x: 1, y: 1 });
    expect(armyLimit(s, 0, TANK)).toBeNull();
    newUnit(s, TANK, 0, { x: 2, y: 2 });
    expect(armyLimit(s, 0, SOLDIER)).toBe('units');
  });
});

describe('mantenimiento', () => {
  it('se paga el 10 % del precio de las unidades despues de cobrar', () => {
    const s = withoutHeadquarters(blankState(TEST_RULES));
    for (const team of s.teams) team.funds = 0;
    s.buildings.push({ type: CITY, owner: 0, x: 1, y: 1 }); // 1000 por ronda
    newUnit(s, SOLDIER, 0, { x: 5, y: 5 }); // 1500
    newUnit(s, TANK, 0, { x: 6, y: 6 }); // 12000
    expect(upkeepOf(s, 0)).toBe(1400); // 1350 redondeado a 100
    const round = endRoundReport(s);
    expect(round.income[0]).toBe(1000);
    // No llega: se paga lo que hay y no pasa nada mas.
    expect(round.upkeep[0]).toBe(1000);
    expect(teamState(s, 0).funds).toBe(0);
    expect(s.units).toHaveLength(2);
    teamState(s, 0).funds = 5000;
    expect(endRoundReport(s).upkeep[0]).toBe(1400);
    expect(teamState(s, 0).funds).toBe(5000 + 1000 - 1400);
  });

  it('con mantenimiento 0 no se cobra nada', () => {
    const s = blankState(rulesWith(defaultContent(), { upkeep: 0 }));
    newUnit(s, TANK, 0, { x: 6, y: 6 });
    expect(upkeepOf(s, 0)).toBe(0);
    expect(endRoundReport(s).upkeep).toEqual([0, 0]);
  });
});
