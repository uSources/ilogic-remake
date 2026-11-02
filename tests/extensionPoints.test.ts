import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, POWER, UNIT, useRules } from '@core/data';
import { HIT_MODIFIERS, ROUND_PHASES, endRound, hitChance, newUnit, tileProtection } from '@core/rules';
import { coverAgainst } from '@core/abilities';
import { blankState } from './helpers';

/** Puntos de extension del nucleo: listas de modificadores del acierto y pasos del fin de ronda. */
beforeEach(() => useRules({ ...DEFAULT_RULES, fog: false }));

const fighter = (): number => UNIT.canfight.findIndex((f, t) => !!f && POWER[t]!.some((p) => p > 0));

describe('modificadores del acierto (HIT_MODIFIERS)', () => {
  it('tienen nombres distintos', () => {
    const ids = HIT_MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hitChance es el poder por la proteccion por cada modificador, en orden', () => {
    const s = blankState();
    const t = fighter();
    const def = POWER[t]!.findIndex((p) => p > 0);
    const a = newUnit(s, t, 0, 2, 2);
    const d = newUnit(s, def, 1, 3, 2);
    d.hitDay = s.day; // flanqueado
    a.kills = 3; // veterano
    let p = POWER[t]![def]! * coverAgainst(t, tileProtection(s, d));
    for (const m of HIT_MODIFIERS) p *= m.factor(s, a, d);
    expect(hitChance(s, a, d)).toBe(p);
  });

  it('con las reglas apagadas cada modificador vale 1', () => {
    useRules({ ...DEFAULT_RULES, fog: false, veterancy: false, flankBonus: 0, abilities: false, weather: false });
    const s = blankState();
    const t = fighter();
    const a = newUnit(s, t, 0, 2, 2);
    const d = newUnit(s, t, 1, 3, 2);
    for (const m of HIT_MODIFIERS) expect(m.factor(s, a, d), m.id).toBe(1);
  });
});

describe('pasos del fin de ronda (ROUND_PHASES)', () => {
  it('tienen nombres distintos y el dia cambia antes que el clima', () => {
    const ids = ROUND_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.indexOf('day')).toBeLessThan(ids.indexOf('weather'));
    expect(ids.indexOf('buildings')).toBeLessThan(ids.indexOf('upkeep'));
  });

  it('endRound los recorre todos: reactiva unidades y pasa el dia', () => {
    const s = blankState();
    const u = newUnit(s, fighter(), 0, 1, 1, false);
    const r = endRound(s);
    expect(s.day).toBe(2);
    expect(u.active && u.canMove && u.canFire).toBe(true);
    expect(r.income).toEqual([0, 0]);
  });
});
