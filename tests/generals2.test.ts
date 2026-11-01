import { beforeEach, describe, expect, it } from 'vitest';
import { chooseAbility } from '@core/aiGenerals';
import { AI, DEFAULT_RULES, GENERALS, UNIT_NAMES, useRules } from '@core/data';
import { generalHitFactor, newGeneral, useAbility } from '@core/generals';
import { newUnit } from '@core/rules';
import { blankState } from './helpers';

/** Roca (reparar) y Ambar (dinero): los efectos heal y funds, y como los valora la IA. */
const T = (n: string) => UNIT_NAMES.indexOf(n);
const def = (id: string) => GENERALS.find((g) => g.id === id)!;

beforeEach(() => useRules({ ...DEFAULT_RULES, fog: false, weather: false }));

describe('Roca: reparar', () => {
  it('sus unidades recuperan vida, sin pasar de 100; las del enemigo no', () => {
    const s = blankState();
    s.generals = [newGeneral('Roca'), null];
    s.generals[0]!.charge = 6;
    const amount = (def('Roca').abilities[0]!.effect as { amount: number }).amount;
    const hurt = newUnit(s, T('Tank'), 0, 3, 3);
    hurt.life = 50;
    const almost = newUnit(s, T('Soldier'), 0, 4, 4);
    almost.life = 100 - Math.floor(amount / 2);
    const enemy = newUnit(s, T('Tank'), 1, 8, 8);
    enemy.life = 50;
    const ev = useAbility(s, 0, 'repair')!;
    expect(hurt.life).toBe(50 + amount);
    expect(almost.life).toBe(100);
    expect(enemy.life).toBe(50);
    expect(ev.heals).toEqual([
      { uid: hurt.uid, amount },
      { uid: almost.uid, amount: Math.floor(amount / 2) },
    ]);
    expect(ev.hits).toEqual([]);
  });

  it('sus vehiculos reciben algo menos de daño', () => {
    const s = blankState();
    s.generals = [newGeneral('Roca'), null];
    const tank = newUnit(s, T('Tank'), 0, 3, 3);
    const soldier = newUnit(s, T('Soldier'), 0, 5, 5);
    const atk = newUnit(s, T('Tank'), 1, 3, 4);
    expect(generalHitFactor(s, atk, tank)).toBeLessThan(1);
    expect(generalHitFactor(s, atk, soldier)).toBe(1);
  });

  it('la IA repara cuando vale la pena, y no con el ejercito entero', () => {
    const s = blankState();
    s.generals = [null, newGeneral('Roca')];
    s.generals[1]!.charge = def('Roca').abilities[0]!.cost;
    const tanks = [3, 5, 7, 9, 11].map((x) => newUnit(s, T('Tank'), 1, x, 3));
    expect(chooseAbility(s, 1)).toBeNull(); // todos enteros: no vale nada
    for (const t of tanks) t.life = 40;
    const c = chooseAbility(s, 1)!;
    expect(c.ability).toBe('repair');
    expect(c.value).toBeGreaterThanOrEqual(AI.GENERALMINVALUE);
  });
});

describe('Ambar: suministros', () => {
  it('da el dinero al momento', () => {
    const s = blankState();
    s.generals = [newGeneral('Ambar'), null];
    s.generals[0]!.charge = 6;
    const amount = (def('Ambar').abilities.find((a) => a.id === 'supplies')!.effect as { amount: number }).amount;
    const before = s.funds[0];
    const ev = useAbility(s, 0, 'supplies')!;
    expect(s.funds[0]).toBe(before + amount);
    expect(ev.funds).toBe(amount);
  });

  it('sus tropas de tierra aciertan mas; los aviones no', () => {
    const s = blankState();
    s.generals = [newGeneral('Ambar'), null];
    const target = newUnit(s, T('Tank'), 1, 5, 6);
    expect(generalHitFactor(s, newUnit(s, T('Soldier'), 0, 5, 5), target)).toBeGreaterThan(1);
    expect(generalHitFactor(s, newUnit(s, T('Fighter'), 0, 6, 6), target)).toBe(1);
  });

  it('la IA valora el dinero por lo que es', () => {
    const s = blankState();
    s.generals = [null, newGeneral('Ambar')];
    s.generals[1]!.charge = 4;
    newUnit(s, T('Soldier'), 1, 10, 10);
    const c = chooseAbility(s, 1)!;
    expect(c.ability).toBe('supplies');
    expect(c.value).toBe((def('Ambar').abilities.find((a) => a.id === 'supplies')!.effect as { amount: number }).amount);
  });
});
