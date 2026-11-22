/**
 * Las banderas de destino: a donde van las unidades propias con orden (la casilla de su orden: atacar,
 * capturar, defender o ir alli; la suya o la de su escuadra). Las flechas de intencion (orderIntents.ts)
 * solo dicen lo de este turno y al señalar; la bandera marca siempre a donde se dirige cada una, aunque
 * le falten varios turnos. La que ya esta en su casilla no la lleva (ahi ya no «va»). Solo las del
 * equipo que mira (las del rival no las sabe). Cada bandera dice quien va: la escuadra (su tecla) si
 * cumple la orden de la escuadra, o la imagen de su tipo si va por su cuenta. Aqui se decide donde y
 * con que; las dibuja el motor (`DestinationMarks`).
 */
import { unitTypeOf } from '../../../core/gameContent';
import { posKey, samePos } from '../../../core/geom';
import type { GameState, Pos, Squad, TeamId, Unit } from '../../../core/model';
import { isAlive, isOnMap, teamUnits } from '../../../core/rules';
import { effectiveStandingOrder, isDetached, squadById } from '../../../core/squads';
import { unitIconKey } from '../../../ui/sprites';
import type { DestinationFlag, DestinationMarks, FlagEmblem } from '../../ports/orders';

/** Cuantos caben en una bandera: si van mas distintos al mismo sitio, los primeros. */
export const MAX_EMBLEMS = 3;

/** Una unidad de camino: a donde va y quien la lleva. */
interface Goer {
  readonly at: Pos;
  readonly emblem: FlagEmblem;
}

/** A donde va esa unidad con su orden, si aun no esta alli. */
function destinationOf(s: GameState, unit: Unit): Pos | undefined {
  const order = effectiveStandingOrder(s, unit);
  if (!order || (isOnMap(unit) && samePos(unit, order.at))) return undefined;
  return order.at;
}

/** Lo que se ve de una escuadra: su tecla de grupo (1-9) o, si no tiene, la inicial de su nombre. */
const squadLabel = (squad: Squad): string => (squad.key !== undefined ? String(squad.key) : squad.name.charAt(0).toUpperCase());

/** Quien lleva a esa unidad: su escuadra, si cumple la orden de la escuadra; si no, ella misma (la imagen de su tipo). */
function emblemOf(s: GameState, unit: Unit): FlagEmblem {
  const squad = squadById(s, unit.squad);
  if (squad?.standingOrder && !isDetached(s, unit)) return { kind: 'squad', label: squadLabel(squad) };
  return { kind: 'unit', image: unitIconKey(unitTypeOf(s, unit), true) };
}

/** Dos del mismo tipo, o de la misma escuadra, salen una vez. */
const emblemKey = (emblem: FlagEmblem): string => (emblem.kind === 'unit' ? emblem.image : `#${emblem.label}`);

/** Las unidades vivas de ese equipo que van a algun sitio. */
function goersOf(s: GameState, team: TeamId): Goer[] {
  return teamUnits(s, team)
    .filter(isAlive)
    .flatMap((unit) => {
      const at = destinationOf(s, unit);
      return at ? [{ at, emblem: emblemOf(s, unit) }] : [];
    });
}

/** Una bandera por casilla de destino (varias pueden ir al mismo sitio), con quienes van, sin repetir. */
export function destinationFlagsOf(s: GameState, team: TeamId): DestinationFlag[] {
  const byTile = new Map<string, { at: Pos; emblems: Map<string, FlagEmblem> }>();
  for (const { at, emblem } of goersOf(s, team)) {
    const flag = byTile.get(posKey(at)) ?? { at, emblems: new Map<string, FlagEmblem>() };
    flag.emblems.set(emblemKey(emblem), emblem);
    byTile.set(posKey(at), flag);
  }
  return [...byTile.values()].map(({ at, emblems }) => ({ at, emblems: [...emblems.values()].slice(0, MAX_EMBLEMS) }));
}

/** Pone las banderas de a donde va cada una ahora (tras cualquier cambio de la partida). */
export function showDestinations(s: GameState, viewer: TeamId, marks: DestinationMarks): void {
  marks.showFlags(destinationFlagsOf(s, viewer));
}
