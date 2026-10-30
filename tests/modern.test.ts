import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, RULES, useRules } from '@core/data';
import { seededRng } from '@core/geom';
import { attackFull, capture, captureProgress, combatForecast, newUnit, visibility } from '@core/rules';
import { blankState } from './helpers';

const SOLDIER = 0,
  TANK = 1,
  ARTILLERY = 2;

beforeEach(() => useRules(DEFAULT_RULES));

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

describe('reglas nuevas: captura por puntos', () => {
  const HQ = 5;
  it('una ciudad cuesta 2 turnos a una unidad entera y pasa directamente a ser tuya', () => {
    const s = blankState();
    s.buildings.push({ type: 0, owner: 1, x: 3, y: 3 });
    const u = newUnit(s, SOLDIER, 0, 3, 3);
    const r1 = capture(s, u)!;
    expect(r1).toEqual({ done: false, left: 10, total: 20 });
    expect(s.buildings[0]!.owner).toBe(1);
    u.active = true;
    const r2 = capture(s, u)!;
    expect(r2.done).toBe(true);
    expect(s.buildings[0]!.owner).toBe(0);
    expect(s.buildings[0]!.capture).toBeNull();
  });

  it('una unidad herida captura mas despacio; la Base tiene 30 puntos', () => {
    const s = blankState();
    s.buildings.push({ type: HQ, owner: 1, x: 3, y: 3 });
    const u = newUnit(s, SOLDIER, 0, 3, 3);
    u.life = 45;
    expect(capture(s, u)!.left).toBe(25);
  });

  it('si la unidad se va, se pierde lo avanzado', () => {
    const s = blankState();
    s.buildings.push({ type: 0, owner: null, x: 3, y: 3 });
    const u = newUnit(s, SOLDIER, 0, 3, 3);
    capture(s, u);
    expect(captureProgress(s, s.buildings[0]!)?.left).toBe(10);
    u.x = 4;
    expect(captureProgress(s, s.buildings[0]!)).toBeNull();
    u.x = 3;
    u.active = true;
    expect(capture(s, u)!.left).toBe(10);
  });
});

describe('reglas nuevas: veterania', () => {
  it('sube de rango al destruir y mejora acierto y defensa', async () => {
    const { hitChance, rank, attackFull, merge } = await import('@core/rules');
    const s = blankState();
    const a = newUnit(s, TANK, 0, 3, 3);
    const b = newUnit(s, TANK, 1, 4, 3);
    const base = hitChance(s, a, b);
    expect(rank(a)).toBe(0);
    b.life = 1;
    const r = attackFull(s, a, b, seededRng(1));
    expect(r.killed).toBe(true);
    expect(a.kills).toBe(1);
    expect(rank(a)).toBe(1);
    const c = newUnit(s, TANK, 1, 4, 3);
    expect(hitChance(s, a, c)).toBeCloseTo(base * 1.05);
    expect(hitChance(s, c, a)).toBeCloseTo(base * 0.95);
    a.kills = 6;
    expect(rank(a)).toBe(3);
    const d = newUnit(s, TANK, 0, 2, 3);
    a.active = true;
    d.active = true;
    merge(s, d, a);
    expect(a.kills).toBe(6);
  });

  it('sin veterania las bajas no cuentan', async () => {
    const { hitChance } = await import('@core/rules');
    useRules({ veterancy: false });
    const s = blankState();
    const a = newUnit(s, TANK, 0, 3, 3);
    const b = newUnit(s, TANK, 1, 4, 3);
    const base = hitChance(s, a, b);
    a.kills = 6;
    expect(hitChance(s, a, b)).toBe(base);
  });
});
