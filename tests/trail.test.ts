import { unitTypeOf } from '@core/gameContent';
import { describe, expect, it } from 'vitest';
import { extendTrail } from '@core/trail';
import { moveRange, pathCost, stepToward, straightTo } from '@core/rules';
import { newUnit } from '@core/measure';
import { blankState, unitTypeNamed } from './helpers';

const type = unitTypeNamed;

describe('ordenes del jugador', () => {
  it('mover en grupo: la casilla alcanzable mas cercana al destino', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const range = moveRange(s, unit);
    const step = stepToward(range, straightTo({ x: 20, y: 5 }));
    expect(step).toEqual({ x: 5 + unitTypeOf(s, unit).move, y: 5 });
    expect(stepToward(range, straightTo({ x: 5, y: 5 }))).toBeNull();
  });

  it('camino trazado: se alarga paso a paso, se recorta al volver y salta al mas corto', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const range = moveRange(s, unit);
    let trail = extendTrail(range, [], { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    trail = extendTrail(range, trail, { x: 6, y: 6 });
    expect(trail.length).toBe(3);
    trail = extendTrail(range, trail, { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    const jump = extendTrail(range, trail, { x: 5, y: 8 });
    expect(jump[jump.length - 1]).toEqual({ x: 5, y: 8 });
    expect(pathCost(range.profile, jump)).toBeLessThanOrEqual(range.profile.budget);
    // Fuera de alcance: se queda como estaba.
    expect(extendTrail(range, trail, { x: 30, y: 30 })).toBe(trail);
  });
});
