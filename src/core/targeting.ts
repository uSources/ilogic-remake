/**
 * A donde apuntar con la unidad elegida: desde que casilla atacar a un objetivo. Logica pura, sin interfaz: la usa la escena y se puede probar.
 */
import { manhattan, samePos } from './geom';
import { attackProblem, fireOrigins, tileProtection } from './rules/combat';
import { sightOf, type Sight } from './rules/visibility';
import type { MoveRange } from './rules/movement';
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
  // Desde donde esta y, si puede moverse y disparar, desde su alcance (fireOrigins).
  const candidates = fireOrigins(s, unit, range).filter(canAttackFrom);
  const onTrail = candidates.find((tile) => samePos(tile, end));
  if (onTrail) return onTrail;
  return minBy(candidates, (tile) => [manhattan(end, tile), tileProtection(s, tile), manhattan(unit, tile)]);
}
