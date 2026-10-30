import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RULES, UNIT, UNIT_NAMES, useRules, Movement } from '@core/data';
import { grid } from '@core/geom';
import { bestAttackTile, closestStep, extendTrail } from '@core/orders';
import { moveRange, newUnit, pathCost } from '@core/rules';
import { blankState } from './helpers';

const type = (n: (typeof UNIT_NAMES)[number]) => UNIT_NAMES.indexOf(n);
const WOODS = 2;

beforeEach(() => useRules(DEFAULT_RULES));

describe('ordenes del jugador', () => {
  it('atacar: prefiere la casilla donde acaba el camino trazado', () => {
    const s = blankState();
    const tank = newUnit(s, type('Tank'), 0, 10, 10);
    const enemy = newUnit(s, type('Soldier'), 1, 13, 10);
    const r = moveRange(s, tank);
    expect(bestAttackTile(s, tank, enemy, r, { x: 13, y: 11 })).toEqual({ x: 13, y: 11 });
  });

  it('atacar: si no, la mas cercana al final del camino y, si empatan, la de mas defensa', () => {
    const s = blankState();
    const tank = newUnit(s, type('Tank'), 0, 10, 10);
    const enemy = newUnit(s, type('Soldier'), 1, 13, 10);
    // Desde (11,12), a distancia 2 hay tres casillas desde las que se le alcanza: (11,10), (12,11) y (13,12).
    s.map[11]![10] = WOODS;
    const r = moveRange(s, tank);
    expect(bestAttackTile(s, tank, enemy, r, { x: 11, y: 12 })).toEqual({ x: 11, y: 10 });
  });

  it('atacar: la artilleria solo desde donde esta; nada sin poder disparar', () => {
    const s = blankState();
    const art = newUnit(s, type('Artillery'), 0, 10, 10);
    const near = newUnit(s, type('Soldier'), 1, 11, 10);
    const far = newUnit(s, type('Soldier'), 1, 10, 10 + UNIT.alcance[type('Artillery')]!);
    const r = moveRange(s, art);
    expect(bestAttackTile(s, art, near, r)).toBeNull();
    expect(bestAttackTile(s, art, far, r)).toEqual({ x: 10, y: 10 });
    art.canFire = false;
    expect(bestAttackTile(s, art, far, r)).toBeNull();
  });

  it('mover en grupo: la casilla alcanzable mas cercana al destino', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    const r = moveRange(s, u);
    const step = closestStep(u, { x: 20, y: 5 }, r)!;
    expect(step).toEqual({ x: 5 + UNIT.mover[u.type]!, y: 5 });
    expect(closestStep(u, { x: 5, y: 5 }, r)).toBeNull();
  });

  it('camino trazado: se alarga paso a paso, se recorta al volver y salta al mas corto', () => {
    const s = blankState();
    const u = newUnit(s, type('Soldier'), 0, 5, 5);
    const r = moveRange(s, u);
    const block = grid(false);
    let trail = extendTrail(s, u, r, block, [], { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    trail = extendTrail(s, u, r, block, trail, { x: 6, y: 6 });
    expect(trail.length).toBe(3);
    trail = extendTrail(s, u, r, block, trail, { x: 6, y: 5 });
    expect(trail).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    const jump = extendTrail(s, u, r, block, trail, { x: 5, y: 8 });
    expect(jump[jump.length - 1]).toEqual({ x: 5, y: 8 });
    expect(pathCost(s, Movement.of(u.type), jump)).toBeLessThanOrEqual(r.maxSteps);
    // Fuera de alcance: se queda como estaba.
    expect(extendTrail(s, u, r, block, trail, { x: 30, y: 30 })).toBe(trail);
  });
});
