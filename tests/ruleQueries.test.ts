import { describe, expect, it } from 'vitest';
import {
  buildingIncome,
  canRepair,
  engagement,
  expectedDamage,
  hasFullArmy,
  isEnemyHq,
  killReward,
  projectedIncome,
  upkeepOf,
  usesCommandPoints,
  visibleFoes,
} from '@core/rules';
import { newUnit } from '@core/measure';
import { buildingTypeOf } from '@core/gameContent';
import type { Building } from '@core/model';
import { blankState, hqId, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');

/** Las preguntas que la IA hacia con copias propias: ahora son de las reglas, una vez. */
describe('consultas de las reglas que usa la IA', () => {
  it('visibleFoes: los enemigos vivos en el mapa y a la vista', () => {
    const s = blankState({ fog: true });
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    const near = newUnit(s, SOLDIER, 1, { x: 3, y: 2 });
    const far = newUnit(s, SOLDIER, 1, { x: 25, y: 25 });
    expect(visibleFoes(s, 0)).toEqual([near]);
    expect(visibleFoes(s, 0, () => true)).toEqual([near, far]);
    expect(visibleFoes(blankState({ fog: false }), 0)).toEqual([]);
  });

  it('canRepair: un edificio de su equipo, que repara su tipo y cura algo', () => {
    const s = blankState();
    const city: Building = { type: 'City', owner: 0, x: 4, y: 4 };
    const oil: Building = { type: 'Oil', owner: 0, x: 6, y: 4 };
    s.buildings.push(city, oil);
    const soldier = newUnit(s, SOLDIER, 0, { x: 4, y: 4 });
    expect(canRepair(s, city, soldier)).toBe(true);
    expect(canRepair(s, oil, soldier)).toBe(false);
    expect(canRepair(s, { ...city, owner: 1 }, soldier)).toBe(false);
  });

  it('isEnemyHq: la Base de un enemigo (no la propia ni otro edificio)', () => {
    const s = blankState();
    const enemyHq: Building = { type: hqId(), owner: 1, x: 0, y: 0 };
    expect(isEnemyHq(s, enemyHq, 0)).toBe(true);
    expect(isEnemyHq(s, enemyHq, 1)).toBe(false);
    expect(isEnemyHq(s, { ...enemyHq, type: 'City' }, 0)).toBe(false);
  });

  it('projectedIncome: lo que pagan sus edificios menos el mantenimiento', () => {
    const s = blankState({ upkeep: 0.1 });
    const city: Building = { type: 'City', owner: 0, x: 4, y: 4 };
    s.buildings.push(city, { type: 'City', owner: 1, x: 8, y: 4 });
    newUnit(s, unitTypeNamed('Tank'), 0, { x: 2, y: 2 });
    const ownIncome = s.buildings
      .filter((building) => building.owner === 0)
      .reduce((total, building) => total + buildingIncome(s, buildingTypeOf(s, building)), 0);
    expect(projectedIncome(s, 0)).toBe(ownIncome - upkeepOf(s, 0));
    expect(ownIncome).toBeGreaterThanOrEqual(buildingIncome(s, buildingTypeOf(s, city)));
    expect(upkeepOf(s, 0)).toBeGreaterThan(0);
  });

  it('hasFullArmy y usesCommandPoints: los topes del ejercito', () => {
    const s = blankState({ maxUnits: 1, commandPoints: null });
    expect(hasFullArmy(s, 0)).toBe(false);
    newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
    expect(hasFullArmy(s, 0)).toBe(true);
    expect(usesCommandPoints(s)).toBe(false);
    expect(usesCommandPoints(blankState({ commandPoints: 30 }))).toBe(true);
  });

  it('el flanqueo como pregunta: rematar a quien otro ya ha dado hoy, sin tocar la partida', () => {
    for (const flankBonus of [0.15, 0]) {
      const s = blankState({ flankBonus, fog: false });
      const shooter = newUnit(s, SOLDIER, 0, { x: 2, y: 2 });
      const foe = newUnit(s, SOLDIER, 1, { x: 3, y: 2 });
      const alone = expectedDamage(s, engagement(shooter, foe));
      const followUp = expectedDamage(s, engagement(shooter, foe, { defenderHitToday: true }));
      if (flankBonus) expect(followUp).toBeGreaterThan(alone);
      else expect(followUp).toBe(alone);
      expect(foe.hitDay).toBeUndefined();
      expect(expectedDamage(s, engagement(shooter, foe, { defenderHitToday: false }))).toBe(alone);
    }
  });

  it('killReward: lo que se cobra por destruir una unidad (el botin, si la partida lo lleva)', () => {
    expect(killReward(blankState({ bounty: 0.25 }), { type: 'Soldier' })).toBe(Math.round(SOLDIER.cost * 0.25));
    expect(killReward(blankState({ bounty: 0 }), { type: 'Soldier' })).toBe(0);
  });
});
