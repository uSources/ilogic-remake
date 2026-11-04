/**
 * Ayudas para las ordenes del jugador (mover, atacar, mover en grupo): que casilla elegir y si una
 * orden es arriesgada. Logica pura, sin interfaz: la usa GameScene y se puede probar.
 */
import { Movement } from './data';
import { manhattan, samePos } from './geom';
import { isRanged } from './abilities';
import { canDamage, inAttackRange, tileProtection } from './rules/combat';
import { moveCost, pathCost, pathTo, reachableTiles, reachableTilesWithCost, type MoveRange } from './rules/movement';
import { canWalk } from './rules/queries';
import type { Grid } from './util/grid';
import { minBy } from './util/pick';
import type { GameState, Pos, Unit } from './model';

/**
 * Mejor casilla desde la que `unit` puede atacar a `target` con su alcance `range`: la de `end`
 * (donde acaba el camino trazado) si vale; si no, la mas cercana a `end`, luego la de mas defensa y
 * luego la mas cercana a la unidad. Null si no puede atacarle.
 */
export function bestAttackTile(s: GameState, unit: Unit, target: Unit, range: MoveRange, end: Pos = unit): Pos | null {
  if (!unit.canFire || !canDamage(unit, target)) return null;
  const reaches = (from: Pos) => inAttackRange(unit.type, from, target);
  // Las que no pueden mover y disparar solo atacan desde donde estan.
  if (isRanged(unit.type)) return reaches(unit) ? { x: unit.x, y: unit.y } : null;

  const candidates: Pos[] = [];
  if (reaches(unit)) candidates.push({ x: unit.x, y: unit.y });
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

/**
 * Camino que se traza al pasar el cursor por `hovered`: si vuelve sobre el camino, se recorta; si es
 * la casilla de al lado y cabe en el movimiento, se alarga; si no, el camino mas corto hasta alli (o
 * el mismo si no se llega). `block` = casillas por las que no puede pasar (enemigos a la vista).
 */
export function extendTrail(s: GameState, unit: Unit, range: MoveRange, block: Grid<boolean>, trail: Pos[], hovered: Pos): Pos[] {
  const current = trail.length ? trail : [{ x: unit.x, y: unit.y }];
  const backIndex = current.findIndex((step) => samePos(step, hovered));
  if (backIndex >= 0) return current.slice(0, backIndex + 1);
  const end = current[current.length - 1]!;
  const movement = Movement.of(unit.type);
  const canExtend =
    manhattan(end, hovered) === 1 &&
    canWalk(s, hovered.x, hovered.y, movement) &&
    !block.at(hovered) &&
    pathCost(s, movement, current) + moveCost(s, movement, hovered.x, hovered.y) <= range.maxSteps;
  if (canExtend) return [...current, { x: hovered.x, y: hovered.y }];
  // Se ha saltado casillas o pasado del movimiento: el camino mas corto hasta ahi (si se llega).
  return range.prev.at(hovered) ? pathTo(range, unit, hovered) : trail;
}
