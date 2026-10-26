import { describe, expect, it } from 'vitest';
import { CLASSIC_RULES, MODERN_RULES, POWER, RULES, UNIT, useRules } from '../src/core/data';
import { duelMatrix } from '../tools/balance/duel';
import { playGame } from '../tools/balance/play';
import { applyVariant, restore, snapshot } from '../tools/balance/variant';

describe('herramienta de equilibrio: variantes', () => {
  it('cambia valores por nombre, indice, comodin y operaciones, y se restaura', () => {
    const snap = snapshot();
    const tank = UNIT.cost[1]!;
    const changes = applyVariant({
      name: 't',
      rules: 'classic',
      set: { 'UNIT.cost.Tank': 9000, 'UNIT.mover.0': 4, 'POWER.Tank.Soldier': '+0.1', 'UNIT.cost.*': 'x2', 'RULES.fog': false },
    });
    expect(UNIT.cost[1]).toBe(18000);
    expect(UNIT.mover[0]).toBe(4);
    expect(POWER[1]![0]).toBeCloseTo(JSON.parse(snap).POWER[1][0] + 0.1);
    expect(RULES.counterattack).toBe(false);
    expect(RULES.fog).toBe(false);
    expect(changes.length).toBeGreaterThan(19);
    restore(snap);
    expect(UNIT.cost[1]).toBe(tank);
    expect(RULES.counterattack).toBe(true);
    expect(RULES.fog).toBe(true);
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

  it('duelos: sin contraataque el defensor no devuelve daño; con el, si', () => {
    const snap = snapshot();
    useRules(CLASSIC_RULES);
    const classic = duelMatrix({ trials: 20, terrain: 'Grass', seed: 1 }).find((c) => c.attacker === 'Tank' && c.defender === 'Tank')!;
    expect(classic.damage).toBeGreaterThan(0);
    expect(classic.counter).toBe(0);
    useRules(MODERN_RULES);
    const modern = duelMatrix({ trials: 20, terrain: 'Grass', seed: 1 }).find((c) => c.attacker === 'Tank' && c.defender === 'Tank')!;
    expect(modern.counter).toBeGreaterThan(0);
    // La artilleria no recibe contraataque.
    const art = duelMatrix({ trials: 5, terrain: 'Grass', seed: 1 }).find((c) => c.attacker === 'Artillery' && c.defender === 'Tank')!;
    expect(art.counter).toBe(0);
    restore(snap);
  });
});
