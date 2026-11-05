/**
 * A donde apuntar con la unidad elegida: desde que casilla atacar a un objetivo y que casilla del
 * alcance acerca mas a un destino. Logica pura, sin interfaz: la usa la escena y se puede probar.
 */
import { manhattan, samePos, posOf } from './geom';
import { isRanged } from './abilities';
import { attackProblem, tileProtection } from './rules/combat';
import { sightOf, type Sight } from './rules/visibility';
import { reachableTiles, reachableTilesWithCost, type MoveRange } from './rules/movement';
import { minBy } from './util/pick';
import type { GameState, Pos, Unit } from './model';

/**
 * Mejor casilla desde la que `unit` puede atacar a `target` con su alcance `range`: la de `end`
 * (donde acaba el camino trazado) si vale; si no, la mas cercana a `end`, luego la de mas defensa y
 * luego la mas cercana a la unidad. Null si no puede atacarle. Desde donde se puede lo dice la regla
 * del ataque (`attackProblem` con `from`), con lo que ve su equipo (`sees`).
 */
export function bestAttackTile(
  s: GameState,
  unit: Unit,
  target: Unit,
  range: MoveRange,
  end: Pos = unit,
  sees: Sight = sightOf(s, unit.team),
): Pos | null {
  const canAttackFrom = (from: Pos) => attackProblem(s, unit, target, sees, from) === null;
  // Las que no pueden mover y disparar solo atacan desde donde estan.
  const origins = isRanged(s, unit) ? [posOf(unit)] : [posOf(unit), ...reachableTiles(range)];
  const candidates = origins.filter(canAttackFrom);
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
