import { describe, expect, it } from 'vitest';
import { influenceOf } from '@core/ai/influence';
import { newUnit } from '@core/measure';
import { blankState, ENEMY, PLAYER, unitTypeNamed } from './helpers';

const SOLDIER = unitTypeNamed('Soldier');
const TANK = unitTypeNamed('Tank');
const ARTILLERY = unitTypeNamed('Artillery');

/** Una partida vacia sin niebla con un tanque propio y un tanque enemigo lejos el uno del otro. */
function twoTanks() {
  const s = blankState({ fog: false, weather: false });
  const mine = newUnit(s, TANK, PLAYER, { x: 2, y: 10 });
  const foe = newUnit(s, TANK, ENEMY, { x: 20, y: 10 });
  return { s, mine, foe };
}

describe('mapas de influencia (docs/PLAN-IA.md, fase 1)', () => {
  it('peligro: solo donde llega un enemigo en su proximo turno, y lo que le quitaria', () => {
    const { s, mine } = twoTanks();
    const influence = influenceOf(s, PLAYER);
    expect(influence.dangerFor(mine, { x: 19, y: 10 })).toBeGreaterThan(0);
    expect(influence.dangerFor(mine, { x: 2, y: 10 })).toBe(0);
  });

  it('peligro: la artilleria no dispara despues de moverse, asi que solo cubre lo que tiene a tiro desde su casilla', () => {
    const s = blankState({ fog: false, weather: false });
    const mine = newUnit(s, SOLDIER, PLAYER, { x: 2, y: 2 });
    newUnit(s, ARTILLERY, ENEMY, { x: 20, y: 10 });
    const influence = influenceOf(s, PLAYER);
    const atRange = ARTILLERY.attack!.maxRange;
    expect(influence.dangerFor(mine, { x: 20 - atRange, y: 10 })).toBeGreaterThan(0);
    expect(influence.dangerFor(mine, { x: 20 - atRange - 1, y: 10 })).toBe(0);
  });

  it('control: a favor cerca de lo propio, en contra cerca del enemigo; el frente, donde cambia', () => {
    const { s } = twoTanks();
    const influence = influenceOf(s, PLAYER);
    expect(influence.control({ x: 3, y: 10 })).toBeGreaterThan(0);
    expect(influence.control({ x: 19, y: 10 })).toBeLessThan(0);
    expect(influence.front.length).toBeGreaterThan(0);
    for (const pos of influence.front) {
      expect(influence.control(pos)).toBeGreaterThanOrEqual(0);
      expect(influence.isFront(pos)).toBe(true);
    }
    expect(influence.isFront({ x: 2, y: 10 })).toBe(false);
  });

  it('no ve lo que su equipo no ve: un enemigo en la niebla no da peligro', () => {
    const s = blankState({ fog: true, weather: false });
    const mine = newUnit(s, TANK, PLAYER, { x: 2, y: 2 });
    newUnit(s, TANK, ENEMY, { x: 25, y: 25 });
    expect(influenceOf(s, PLAYER).dangerFor(mine, { x: 24, y: 25 })).toBe(0);
  });
});
