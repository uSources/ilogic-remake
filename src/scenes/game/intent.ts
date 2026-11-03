/**
 * Mover la unidad elegida: que pasaria al soltarla en una casilla y por que camino iria. Funciones
 * puras (sin Phaser): reciben el plan de movimiento de la escena (tests/sceneIntent.test.ts).
 */
import { UNIT } from '../../core/data';
import { inBounds, samePos } from '../../core/geom';
import { bestAttackTile } from '../../core/orders';
import { buildingAt, pathTo, unitAt, unitById, type MoveRange } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/types';
import { key, type Intent } from './types';

/** La unidad que se esta moviendo y lo que se calculo al elegirla. */
export interface MovePlan {
  unit: Unit;
  range: MoveRange;
  /** Casillas con una unidad a la que unirse o subir ("x,y" → uid). */
  merge: ReadonlyMap<string, number>;
  load: ReadonlyMap<string, number>;
  /** Camino trazado, de la unidad al cursor (incluye la casilla de salida). */
  trail: readonly Pos[];
}

/** Que pasaria al soltar (o pulsar) la unidad elegida en `t`. `visible`: la casilla se ve. */
export function intentAt(s: GameState, plan: MovePlan | null, t: Pos, visible: (p: Pos) => boolean): Intent {
  if (!plan || !inBounds(t.x, t.y)) return { kind: 'none' };
  const { unit: u, range: r } = plan;
  if (samePos(t, u)) return { kind: 'stay' };
  const mergeUid = plan.merge.get(key(t));
  if (mergeUid !== undefined) return { kind: 'merge', target: unitById(s, mergeUid)! };
  const loadUid = plan.load.get(key(t));
  if (loadUid !== undefined) return { kind: 'load', target: unitById(s, loadUid)! };
  const enemy = unitAt(s, t.x, t.y);
  if (enemy && enemy.team !== u.team && enemy.carrier === null && visible(enemy)) {
    const from = attackFrom(s, plan, enemy);
    return from ? { kind: 'attack', from, target: enemy } : { kind: 'none' };
  }
  if (r.steps[t.x]![t.y]! > 0) {
    const b = buildingAt(s, t.x, t.y);
    return { kind: 'move', to: { x: t.x, y: t.y }, capture: !!b && b.owner !== u.team && !!UNIT.cancapt[u.type] };
  }
  return { kind: 'none' };
}

/** Mejor casilla desde la que atacar a `target` (ver bestAttackTile). */
export function attackFrom(s: GameState, plan: MovePlan, target: Unit): Pos | null {
  return bestAttackTile(s, plan.unit, target, plan.range, plan.trail[plan.trail.length - 1] ?? plan.unit);
}

/** Camino hasta `dest`: el trazado si acaba ahi, si no el mas corto. */
export function trailTo(plan: MovePlan, dest: Pos): Pos[] {
  const trail = plan.trail as Pos[];
  const end = trail[trail.length - 1];
  if (end && samePos(end, dest) && samePos(trail[0]!, plan.unit)) return trail;
  const i = trail.findIndex((p) => samePos(p, dest));
  if (i > 0) return trail.slice(0, i + 1);
  return pathTo(plan.range, plan.unit, dest);
}
