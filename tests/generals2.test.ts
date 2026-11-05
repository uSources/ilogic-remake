import { describe, expect, it } from 'vitest';
import { choosePower } from '@core/aiGenerals';
import { rulesWith } from '@core/rulesConfig';
import { defaultContent } from '@core/content/default';
import { generalHitFactor, appointGeneral, usePower } from '@core/generals';
import { newUnit } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';
import { teamState } from '@core/teams';

const AI = defaultContent().ai;

/** Roca (reparar) y Ambar (dinero): los efectos heal y funds, y como los valora la IA. */
const unitType = unitTypeNamed;
const generalDefinition = (id: string) => defaultContent().files.generals.find((general) => general.id === id)!;

/** Reglas de las partidas de estos tests. */
const TEST_RULES = rulesWith(defaultContent(), { fog: false, weather: false });

describe('Roca: reparar', () => {
  it('sus unidades recuperan vida, sin pasar de 100; las del enemigo no', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 0, 'Roca');
    teamState(s, 0).general!.charge = 6;
    const amount = (generalDefinition('Roca').powers[0]!.effect as { amount: number }).amount;
    const hurt = newUnit(s, unitType('Tank'), 0, { x: 3, y: 3 });
    hurt.life = 50;
    const almost = newUnit(s, unitType('Soldier'), 0, { x: 4, y: 4 });
    almost.life = 100 - Math.floor(amount / 2);
    const enemy = newUnit(s, unitType('Tank'), 1, { x: 8, y: 8 });
    enemy.life = 50;
    const event = usePower(s, 0, 'repair')!;
    expect(hurt.life).toBe(50 + amount);
    expect(almost.life).toBe(100);
    expect(enemy.life).toBe(50);
    expect(event.heals).toEqual([
      { uid: hurt.uid, amount },
      { uid: almost.uid, amount: Math.floor(amount / 2) },
    ]);
    expect(event.hits).toEqual([]);
  });

  it('sus vehiculos reciben algo menos de daño', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 0, 'Roca');
    const tank = newUnit(s, unitType('Tank'), 0, { x: 3, y: 3 });
    const soldier = newUnit(s, unitType('Soldier'), 0, { x: 5, y: 5 });
    const attacker = newUnit(s, unitType('Tank'), 1, { x: 3, y: 4 });
    expect(generalHitFactor(s, attacker, tank)).toBeLessThan(1);
    expect(generalHitFactor(s, attacker, soldier)).toBe(1);
  });

  it('la IA repara cuando vale la pena, y no con el ejercito entero', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 1, 'Roca');
    teamState(s, 1).general!.charge = generalDefinition('Roca').powers[0]!.cost;
    const tanks = [3, 5, 7, 9, 11].map((x) => newUnit(s, unitType('Tank'), 1, { x: x, y: 3 }));
    expect(choosePower(s, 1)).toBeNull(); // todos enteros: no vale nada
    for (const tank of tanks) tank.life = 40;
    const choice = choosePower(s, 1)!;
    expect(choice.power).toBe('repair');
    expect(choice.value).toBeGreaterThanOrEqual(AI.GENERALMINVALUE);
  });
});

describe('Ambar: suministros', () => {
  it('da el dinero al momento', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 0, 'Ambar');
    teamState(s, 0).general!.charge = 6;
    const amount = (generalDefinition('Ambar').powers.find((power) => power.id === 'supplies')!.effect as { amount: number }).amount;
    const before = teamState(s, 0).funds;
    const event = usePower(s, 0, 'supplies')!;
    expect(teamState(s, 0).funds).toBe(before + amount);
    expect(event.funds).toBe(amount);
  });

  it('sus tropas de tierra aciertan mas; los aviones no', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 0, 'Ambar');
    const target = newUnit(s, unitType('Tank'), 1, { x: 5, y: 6 });
    expect(generalHitFactor(s, newUnit(s, unitType('Soldier'), 0, { x: 5, y: 5 }), target)).toBeGreaterThan(1);
    expect(generalHitFactor(s, newUnit(s, unitType('Fighter'), 0, { x: 6, y: 6 }), target)).toBe(1);
  });

  it('la IA valora el dinero por lo que es', () => {
    const s = blankState(TEST_RULES);
    appointGeneral(s, 1, 'Ambar');
    teamState(s, 1).general!.charge = 4;
    newUnit(s, unitType('Soldier'), 1, { x: 10, y: 10 });
    const choice = choosePower(s, 1)!;
    expect(choice.power).toBe('supplies');
    expect(choice.value).toBe(
      (generalDefinition('Ambar').powers.find((power) => power.id === 'supplies')!.effect as { amount: number }).amount,
    );
  });
});
