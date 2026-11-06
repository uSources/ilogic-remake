/**
 * El camino que el jugador traza con el cursor al mover una unidad: se alarga casilla a casilla, se
 * recorta al volver sobre el y salta al mas corto si se pasa. Logica pura, sin interfaz.
 */
import { samePos, posOf } from './geom';
import { pathTo, stepAllowed, type MoveRange } from './rules/movement';
import { pathCost } from './rules/movementProfile';
import type { Pos } from './model';

/**
 * Camino que se traza al pasar el cursor por `hovered`: si vuelve sobre el camino, se recorta; si el
 * paso hasta alli vale (`stepAllowed`, el mismo que el del alcance), se alarga; si no, el camino mas
 * corto hasta alli (o el mismo si no se llega).
 */
export function extendTrail(range: MoveRange, trail: Pos[], hovered: Pos): Pos[] {
  const current = trail.length ? trail : [posOf(range.origin)];
  const backIndex = current.findIndex((step) => samePos(step, hovered));
  if (backIndex >= 0) return current.slice(0, backIndex + 1);
  const end = current.at(-1) ?? range.origin;
  if (stepAllowed(range, { from: end, to: hovered, spent: pathCost(range.profile, current) })) return [...current, posOf(hovered)];
  // Se ha saltado casillas o pasado del movimiento: el camino mas corto hasta ahi (si se llega).
  return range.prev.at(hovered) ? pathTo(range, hovered) : trail;
}
