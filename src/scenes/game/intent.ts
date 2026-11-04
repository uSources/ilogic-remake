/**
 * Mover la unidad elegida: que pasaria al soltarla en una casilla y por que camino iria. Funciones
 * puras (sin Phaser): reciben el plan de movimiento de la escena (tests/sceneIntent.test.ts).
 */
import { UNIT } from '../../core/data';
import { inBounds, samePos } from '../../core/geom';
import { bestAttackTile } from '../../core/orders';
import { buildingAt, pathTo, unitAt, unitById, type MoveRange } from '../../core/rules';
import type { GameState, Pos, Unit } from '../../core/model';
import { cellAt } from '../../core/util/grid';
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

/** Que pasaria al soltar (o pulsar) la unidad elegida en `tile`. `visible`: la casilla se ve. */
export function intentAt(s: GameState, plan: MovePlan | null, tile: Pos, visible: (p: Pos) => boolean): Intent {
  if (!plan || !inBounds(tile.x, tile.y)) return { kind: 'none' };
  const unit = plan.unit;
  if (samePos(tile, unit)) return { kind: 'stay' };
  const mergeUid = plan.merge.get(key(tile));
  if (mergeUid !== undefined) return { kind: 'merge', target: unitById(s, mergeUid)! };
  const loadUid = plan.load.get(key(tile));
  if (loadUid !== undefined) return { kind: 'load', target: unitById(s, loadUid)! };
  const other = unitAt(s, tile.x, tile.y);
  if (other && other.team !== unit.team && other.carrier === null && visible(other)) {
    const from = attackFrom(s, plan, other);
    return from ? { kind: 'attack', from, target: other } : { kind: 'none' };
  }
  if (!isReachable(plan.range, tile)) return { kind: 'none' };
  const building = buildingAt(s, tile.x, tile.y);
  const isCapture = !!building && building.owner !== unit.team && !!UNIT.cancapt[unit.type];
  return { kind: 'move', to: { x: tile.x, y: tile.y }, capture: isCapture };
}

/** La unidad puede terminar su movimiento en esa casilla este turno. */
const isReachable = (range: MoveRange, tile: Pos) => cellAt(range.steps, tile) > 0;

/** Mejor casilla desde la que atacar a `target` (ver bestAttackTile). */
export function attackFrom(s: GameState, plan: MovePlan, target: Unit): Pos | null {
  return bestAttackTile(s, plan.unit, target, plan.range, plan.trail[plan.trail.length - 1] ?? plan.unit);
}

/** Camino hasta `dest`: el trazado si acaba ahi, si no el mas corto. */
export function trailTo(plan: MovePlan, dest: Pos): Pos[] {
  const trail = plan.trail as Pos[];
  const end = trail[trail.length - 1];
  if (end && samePos(end, dest) && samePos(trail[0]!, plan.unit)) return trail;
  // El destino esta a mitad del camino trazado: hasta ahi.
  const destIndex = trail.findIndex((p) => samePos(p, dest));
  if (destIndex > 0) return trail.slice(0, destIndex + 1);
  return pathTo(plan.range, plan.unit, dest);
}
