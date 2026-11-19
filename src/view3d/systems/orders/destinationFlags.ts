/**
 * Las banderas de destino: a donde van las unidades propias con orden (la casilla de su orden: atacar,
 * capturar, defender o ir alli; la suya o la de su escuadra). Las flechas de intencion (orderIntents.ts)
 * solo dicen lo de este turno y al señalar; la bandera marca siempre a donde se dirige cada una, aunque
 * le falten varios turnos. La que ya esta en su casilla no la lleva (ahi ya no «va»). Solo las del
 * equipo que mira (las del rival no las sabe). Aqui se decide donde; las dibuja el motor (`DestinationMarks`).
 */
import { posKey, samePos } from '../../../core/geom';
import type { GameState, Pos, TeamId, Unit } from '../../../core/model';
import { isAlive, isOnMap, teamUnits } from '../../../core/rules';
import { effectiveStandingOrder } from '../../../core/squads';
import type { DestinationMarks } from '../../ports/orders';

/** A donde va esa unidad con su orden, si aun no esta alli. */
function destinationOf(s: GameState, unit: Unit): Pos | undefined {
  const order = effectiveStandingOrder(s, unit);
  if (!order || (isOnMap(unit) && samePos(unit, order.at))) return undefined;
  return order.at;
}

/** Las casillas a las que van las unidades vivas de ese equipo, una vez cada una (varias pueden ir al mismo sitio). */
export function orderDestinations(s: GameState, team: TeamId): Pos[] {
  const destinations = teamUnits(s, team)
    .filter(isAlive)
    .map((unit) => destinationOf(s, unit))
    .filter((pos): pos is Pos => !!pos);
  return [...new Map(destinations.map((pos) => [posKey(pos), pos])).values()];
}

/** Pone las banderas de a donde va cada una ahora (tras cualquier cambio de la partida). */
export function showDestinations(s: GameState, viewer: TeamId, marks: DestinationMarks): void {
  marks.showFlags(orderDestinations(s, viewer));
}
