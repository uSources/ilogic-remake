import { unitTypeOf } from '@core/gameContent';
import { describe, expect, it } from 'vitest';
import { createLayer } from '@core/mapGrid';
import { bestAttackTile, closestStep } from '@core/targeting';
import { extendTrail } from '@core/trail';
import { moveRange, newUnit, pathCost } from '@core/rules';
import { blankState, unitTypeNamed } from './helpers';

const type = unitTypeNamed;
const WOODS = 'Woods';

describe('ordenes del jugador', () => {
  it('atacar: prefiere la casilla donde acaba el camino trazado', () => {
    const s = blankState();
    const tank = newUnit(s, type('Tank'), 0, { x: 10, y: 10 });
    const enemy = newUnit(s, type('Soldier'), 1, { x: 13, y: 10 });
    const range = moveRange(s, tank);
    expect(bestAttackTile(s, tank, enemy, range, { x: 13, y: 11 })).toEqual({ x: 13, y: 11 });
  });

  it('atacar: si no, la mas cercana al final del camino y, si empatan, la de mas defensa', () => {
    const s = blankState();
    const tank = newUnit(s, type('Tank'), 0, { x: 10, y: 10 });
    const enemy = newUnit(s, type('Soldier'), 1, { x: 13, y: 10 });
    // Desde (11,12), a distancia 2 hay tres casillas desde las que se le alcanza: (11,10), (12,11) y (13,12).
    s.map[11]![10] = WOODS;
    const range = moveRange(s, tank);
    expect(bestAttackTile(s, tank, enemy, range, { x: 11, y: 12 })).toEqual({ x: 11, y: 10 });
  });

  it('atacar: la artilleria solo desde donde esta; nada sin poder disparar', () => {
    const s = blankState();
    const art = newUnit(s, type('Artillery'), 0, { x: 10, y: 10 });
    const near = newUnit(s, type('Soldier'), 1, { x: 11, y: 10 });
    const far = newUnit(s, type('Soldier'), 1, { x: 10, y: 10 + type('Artillery').attack!.maxRange });
    const range = moveRange(s, art);
    expect(bestAttackTile(s, art, near, range)).toBeNull();
    expect(bestAttackTile(s, art, far, range)).toEqual({ x: 10, y: 10 });
    art.canFire = false;
    expect(bestAttackTile(s, art, far, range)).toBeNull();
  });

  it('mover en grupo: la casilla alcanzable mas cercana al destino', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const range = moveRange(s, unit);
    const step = closestStep(unit, { x: 20, y: 5 }, range)!;
    expect(step).toEqual({ x: 5 + unitTypeOf(s, unit).move, y: 5 });
    expect(closestStep(unit, { x: 5, y: 5 }, range)).toBeNull();
  });

  it('camino trazado: se alarga paso a paso, se recorta al volver y salta al mas corto', () => {
    const s = blankState();
    const unit = newUnit(s, type('Soldier'), 0, { x: 5, y: 5 });
    const range = moveRange(s, unit);
    const block = createLayer(s, false);
    let trail = extendTrail(s, unit, range, block, [], { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    trail = extendTrail(s, unit, range, block, trail, { x: 6, y: 6 });
    expect(trail.length).toBe(3);
    trail = extendTrail(s, unit, range, block, trail, { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    const jump = extendTrail(s, unit, range, block, trail, { x: 5, y: 8 });
    expect(jump[jump.length - 1]).toEqual({ x: 5, y: 8 });
    expect(pathCost(s, unitTypeOf(s, unit).movement, jump)).toBeLessThanOrEqual(range.maxSteps);
    // Fuera de alcance: se queda como estaba.
    expect(extendTrail(s, unit, range, block, trail, { x: 30, y: 30 })).toBe(trail);
  });
});
