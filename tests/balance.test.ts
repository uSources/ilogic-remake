import { describe, expect, it } from 'vitest';
import { POWER, RULES, UNIT } from '../src/core/data';
import { duelMatrix } from '../tools/balance/duel';
import { playGame } from '../tools/balance/play';
import { applyVariant, restore, snapshot } from '../tools/balance/variant';

describe('herramienta de equilibrio: variantes', () => {
  it('cambia valores por nombre, indice, comodin y operaciones, y se restaura', () => {
    const snap = snapshot();
    const tank = UNIT.cost[1]!;
    const changes = applyVariant({
      name: 't',
      set: { 'UNIT.cost.Tank': 9000, 'UNIT.mover.0': 4, 'POWER.Tank.Soldier': '+0.1', 'UNIT.cost.*': 'x2', 'RULES.counterattack': true },
    });
    expect(UNIT.cost[1]).toBe(18000);
    expect(UNIT.mover[0]).toBe(4);
    expect(POWER[1]![0]).toBeCloseTo(JSON.parse(snap).POWER[1][0] + 0.1);
    expect(RULES.counterattack).toBe(true);
    expect(changes.length).toBeGreaterThan(19);
    restore(snap);
    expect(UNIT.cost[1]).toBe(tank);
    expect(RULES.counterattack).toBe(false);
  });

  it('avisa de rutas o valores no validos', () => {
    const snap = snapshot();
    expect(() => applyVariant({ name: 'x', set: { 'UNIT.cost.Dragon': 1 } })).toThrow(/Dragon/);
    expect(() => applyVariant({ name: 'x', set: { 'NADA.cost': 1 } })).toThrow(/Tabla/);
    expect(() => applyVariant({ name: 'x', set: { 'UNIT.cost': 1 } })).toThrow(/tabla entera/);
    expect(() => applyVariant({ name: 'x', set: { 'UNIT.cost.Tank': 'mucho' } })).toThrow(/no valido/);
    restore(snap);
  });
});

describe('herramienta de equilibrio: partidas y duelos', () => {
  it('la misma semilla da la misma partida', () => {
    const a = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'] });
    const b = playGame({ seed: 5, maxDays: 6, policies: ['ai', 'ai'] });
    expect(a).toEqual(b);
    expect(a.samples.length).toBeGreaterThan(5);
    expect(a.units[0]!.reduce((n, t) => n + t.bought, 0)).toBeGreaterThan(0);
  });

  it('duelos: sin contraataque el defensor no devuelve daño', () => {
    const cells = duelMatrix({ trials: 20, terrain: 'Grass', seed: 1 });
    const tt = cells.find((c) => c.attacker === 'Tank' && c.defender === 'Tank')!;
    expect(tt.damage).toBeGreaterThan(0);
    expect(tt.counter).toBe(0);
    expect(tt.firstStrikeWins).toBeGreaterThan(0.8);
  });
});
