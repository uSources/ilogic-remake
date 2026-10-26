import { beforeEach, describe, expect, it } from 'vitest';
import { MODERN_RULES, RULES, UNIT, useRules } from '../src/core/data';
import { seededRng } from '../src/core/geom';
import { attackFull, combatForecast, newUnit, visibility } from '../src/core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  ARTILLERY = 2;

beforeEach(() => useRules(MODERN_RULES));

describe('reglas nuevas: combate', () => {
  it('el defensor que sobrevive contraataca y gasta municion', () => {
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const d = newUnit(s, TANK, 1, 10, 11);
    const r = attackFull(s, a, d, seededRng(2));
    expect(r.damage).toBeGreaterThan(0);
    expect(r.killed).toBe(false);
    expect(r.counter).toBeGreaterThan(0);
    expect(a.life).toBe(100 - r.counter);
    expect(d.ammo).toBe(UNIT.maxammo[TANK]! - 1);
    // Responde con la vida que le queda: menos de lo que recibio.
    expect(r.counter).toBeLessThan(r.damage);
  });

  it('la artilleria ni contraataca ni recibe contraataque', () => {
    const s = blankState();
    const art = newUnit(s, ARTILLERY, 0, 10, 10);
    const t = newUnit(s, TANK, 1, 10, 13);
    expect(attackFull(s, art, t, seededRng(1)).counter).toBe(0);
    const s2 = blankState();
    const t2 = newUnit(s2, TANK, 0, 10, 10);
    const art2 = newUnit(s2, ARTILLERY, 1, 10, 11);
    expect(attackFull(s2, t2, art2, seededRng(1)).counter).toBe(0);
  });

  it('daño = esperado +-10 %', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = blankState();
      const a = newUnit(s, TANK, 0, 10, 10);
      const d = newUnit(s, SOLDIER, 1, 10, 11);
      d.life = 100;
      const f = combatForecast(s, a, d);
      const r = attackFull(s, a, d, seededRng(seed));
      expect(r.damage).toBeGreaterThanOrEqual(f.low - 1);
      expect(r.damage).toBeLessThanOrEqual(Math.max(f.high, 0) + 1);
    }
  });

  it('la prevision incluye el contraataque', () => {
    const s = blankState();
    const a = newUnit(s, TANK, 0, 10, 10);
    const d = newUnit(s, TANK, 1, 10, 11);
    const f = combatForecast(s, a, d);
    expect(f.counter).not.toBeNull();
    expect(f.counter!.expected).toBeGreaterThan(0);
    expect(f.counter!.expected).toBeLessThan(f.expected);
    d.life = 1;
    expect(combatForecast(s, a, d).counter!.expected).toBe(0);
  });

  it('sin niebla se ve todo el mapa', () => {
    const s = blankState();
    RULES.fog = false;
    expect(visibility(s, 0).every((col) => col.every(Boolean))).toBe(true);
  });
});
