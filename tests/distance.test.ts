import { describe, expect, it } from 'vitest';
import { MoveType } from '@core/content';
import { distanceMap, noBlockers, passBlockers, unitsBlock } from '@core/rules';
import { newUnit } from '@core/measure';
import { blankState, unitTypeNamed } from './helpers';

/** Distancia por tierra (distanceMap) con cada estrategia de lo que corta el paso (Blockers). */

const TANK = unitTypeNamed('Tank');

/** Pasillo de agua en y=4 y y=6: por tierra solo se va en linea recta por y=5. */
function corridor(rules = {}) {
  const s = blankState(rules);
  for (let x = 0; x < 32; x++) for (const y of [4, 6]) s.map[x]![y] = 'Water';
  return s;
}

describe('distanceMap', () => {
  it('0 en el origen, los pasos en el resto e Infinity donde no se llega', () => {
    const s = corridor();
    const distance = distanceMap(s, { x: 2, y: 5 }, MoveType.FOOT);
    expect(distance.at({ x: 2, y: 5 })).toBe(0);
    expect(distance.at({ x: 7, y: 5 })).toBe(5);
    expect(distance.at({ x: 2, y: 4 })).toBe(Infinity);
  });

  it('las unidades cortan el paso segun la estrategia: ninguna, todas (menos la que mide) o las que digan las reglas de paso', () => {
    const s = corridor({ fog: false });
    const mover = newUnit(s, TANK, 0, { x: 2, y: 5 });
    newUnit(s, TANK, 0, { x: 4, y: 5 });
    const beyond = { x: 7, y: 5 };
    expect(distanceMap(s, mover, MoveType.VEHICLE, noBlockers).at(beyond)).toBe(5);
    expect(distanceMap(s, mover, MoveType.VEHICLE, unitsBlock(s, mover)).at(beyond)).toBe(Infinity);
    expect(distanceMap(s, mover, MoveType.VEHICLE, passBlockers(s, mover)).at(beyond)).toBe(5);
    newUnit(s, TANK, 1, { x: 6, y: 5 });
    expect(distanceMap(s, mover, MoveType.VEHICLE, passBlockers(s, mover)).at(beyond)).toBe(Infinity);
  });
});
