import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, UNIT, useRules } from '@core/data';
import { armyLimit, buyOptions, commandUsed, endRound, newUnit, spawn, upkeepOf } from '@core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1;
const CITY = 0,
  FACTORY = 2;

beforeEach(() => useRules({ ...DEFAULT_RULES, commandPoints: 10, upkeep: 0.1 }));

describe('puntos de mando', () => {
  it('cada unidad ocupa los puntos de su tipo', () => {
    const s = blankState();
    newUnit(s, SOLDIER, 0, 1, 1);
    newUnit(s, TANK, 0, 2, 2);
    newUnit(s, TANK, 1, 3, 3);
    expect(commandUsed(s, 0)).toBe(UNIT.command[SOLDIER]! + UNIT.command[TANK]!);
  });

  it('no se puede comprar si la unidad no cabe, aunque haya dinero', () => {
    const s = blankState();
    s.funds[0] = 100000;
    const f = { type: FACTORY, owner: 0 as const, x: 4, y: 4 };
    s.buildings.push(f);
    newUnit(s, TANK, 0, 1, 1);
    newUnit(s, TANK, 0, 2, 2); // 8 de 10
    expect(armyLimit(s, 0, TANK)).toBe('command');
    expect(buyOptions(s, f).find((o) => o.type === TANK)?.blocked).toBe('command');
    expect(spawn(s, f, TANK)).toBeNull();
    expect(s.funds[0]).toBe(100000);
    // Lo pequeño si cabe.
    const city = { type: CITY, owner: 0 as const, x: 6, y: 6 };
    s.buildings.push(city);
    expect(buyOptions(s, city).find((o) => o.type === SOLDIER)?.affordable).toBe(true);
    expect(spawn(s, city, SOLDIER)).not.toBeNull();
  });

  it('sin la regla solo cuenta el limite de unidades', () => {
    useRules({ ...DEFAULT_RULES, commandPoints: null, maxUnits: 2 });
    const s = blankState();
    newUnit(s, TANK, 0, 1, 1);
    expect(armyLimit(s, 0, TANK)).toBeNull();
    newUnit(s, TANK, 0, 2, 2);
    expect(armyLimit(s, 0, SOLDIER)).toBe('units');
  });
});

describe('mantenimiento', () => {
  it('se paga el 10 % del precio de las unidades despues de cobrar', () => {
    const s = blankState();
    s.funds = [0, 0];
    s.buildings.push({ type: CITY, owner: 0, x: 1, y: 1 }); // 1000 por ronda
    newUnit(s, SOLDIER, 0, 5, 5); // 1500
    newUnit(s, TANK, 0, 6, 6); // 12000
    expect(upkeepOf(s, 0)).toBe(1400); // 1350 redondeado a 100
    const r = endRound(s);
    expect(r.income[0]).toBe(1000);
    // No llega: se paga lo que hay y no pasa nada mas.
    expect(r.upkeep[0]).toBe(1000);
    expect(s.funds[0]).toBe(0);
    expect(s.units).toHaveLength(2);
    s.funds[0] = 5000;
    expect(endRound(s).upkeep[0]).toBe(1400);
    expect(s.funds[0]).toBe(5000 + 1000 - 1400);
  });

  it('con mantenimiento 0 no se cobra nada', () => {
    useRules({ ...DEFAULT_RULES, upkeep: 0 });
    const s = blankState();
    newUnit(s, TANK, 0, 6, 6);
    expect(upkeepOf(s, 0)).toBe(0);
    expect(endRound(s).upkeep).toEqual([0, 0]);
  });
});
