/**
 * A donde apuntar con la unidad elegida: desde que casilla atacar a un objetivo y que casilla del
 * alcance acerca mas a un destino. Logica pura, sin interfaz: la usa la escena y se puede probar.
 */
import { manhattan, samePos, posOf } from './geom';
import { isRanged } from './abilities';
import { canDamage, inAttackRange, tileProtection } from './rules/combat';
import { reachableTiles, reachableTilesWithCost, type MoveRange } from './rules/movement';
import { minBy } from './util/pick';
import type { GameState, Pos, Unit } from './model';

/**
 * Mejor casilla desde la que `unit` puede atacar a `target` con su alcance `range`: la de `end`
 * (donde acaba el camino trazado) si vale; si no, la mas cercana a `end`, luego la de mas defensa y
 * luego la mas cercana a la unidad. Null si no puede atacarle.
 */
export function bestAttackTile(s: GameState, unit: Unit, target: Unit, range: MoveRange, end: Pos = unit): Pos | null {
  if (!unit.canFire || !canDamage(s, unit, target)) return null;
  const reaches = (from: Pos) => inAttackRange(s, unit, from, target);
  // Las que no pueden mover y disparar solo atacan desde donde estan.
  if (isRanged(s, unit)) return reaches(unit) ? posOf(unit) : null;

  const candidates: Pos[] = [];
  if (reaches(unit)) candidates.push(posOf(unit));
  candidates.push(...reachableTiles(range).filter(reaches));
  const onTrail = candidates.find((tile) => samePos(tile, end));
  if (onTrail) return onTrail;
  return minBy(candidates, (tile) => [manhattan(end, tile), tileProtection(s, tile), manhattan(unit, tile)]);
}

/** Casilla alcanzable mas cercana a `goal` (si empata, la que cuesta menos); null si ninguna acerca. */
export function closestStep(unit: Unit, goal: Pos, range: MoveRange): Pos | null {
  const distanceNow = manhattan(unit, goal);
  const closer = reachableTilesWithCost(range).filter((tile) => manhattan(tile.pos, goal) < distanceNow);
  return minBy(closer, (tile) => [manhattan(tile.pos, goal), tile.cost])?.pos ?? null;
}
