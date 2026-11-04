/**
 * El camino que el jugador traza con el cursor al mover una unidad: se alarga casilla a casilla, se
 * recorta al volver sobre el y salta al mas corto si se pasa. Logica pura, sin interfaz.
 */

import { movementOf } from './gameContent';
import { manhattan, samePos, posOf } from './geom';
import { moveCost, pathCost, pathTo, type MoveRange } from './rules/movement';
import { canWalk } from './rules/queries';
import type { Grid } from './util/grid';
import type { GameState, Pos, Unit } from './model';

/**
 * Camino que se traza al pasar el cursor por `hovered`: si vuelve sobre el camino, se recorta; si es
 * la casilla de al lado y cabe en el movimiento, se alarga; si no, el camino mas corto hasta alli (o
 * el mismo si no se llega). `block` = casillas por las que no puede pasar (enemigos a la vista).
 */
export function extendTrail(s: GameState, unit: Unit, range: MoveRange, block: Grid<boolean>, trail: Pos[], hovered: Pos): Pos[] {
  const current = trail.length ? trail : [posOf(unit)];
  const backIndex = current.findIndex((step) => samePos(step, hovered));
  if (backIndex >= 0) return current.slice(0, backIndex + 1);
  const end = current[current.length - 1]!;
  const movement = movementOf(s, unit.type);
  const canExtend =
    manhattan(end, hovered) === 1 &&
    canWalk(s, hovered, movement) &&
    !block.at(hovered) &&
    pathCost(s, movement, current) + moveCost(s, movement, hovered) <= range.maxSteps;
  if (canExtend) return [...current, posOf(hovered)];
  // Se ha saltado casillas o pasado del movimiento: el camino mas corto hasta ahi (si se llega).
  return range.prev.at(hovered) ? pathTo(range, unit, hovered) : trail;
}
