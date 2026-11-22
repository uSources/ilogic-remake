/**
 * Las banderas de destino: a donde van las unidades propias con orden (la casilla de su orden: atacar,
 * capturar, defender o ir alli; la suya o la de su escuadra). Las flechas de intencion (orderIntents.ts)
 * solo dicen lo de este turno y al señalar; la bandera marca siempre a donde se dirige cada una, aunque
 * le falten varios turnos. La que ya esta en su casilla no la lleva (ahi ya no «va»). Solo las del
 * equipo que mira (las del rival no las sabe). Cada bandera dice quien va: la escuadra (su tecla) si
 * cumple la orden de la escuadra, o la imagen de su tipo si va por su cuenta; si no caben, cuantos mas
 * van. Aqui se decide donde y con que; las dibuja el motor (`DestinationMarks`).
 */
import { unitTypeOf } from '../../../core/gameContent';
import { posKey, samePos } from '../../../core/geom';
import type { GameState, Pos, Squad, TeamId, Unit } from '../../../core/model';
import { isAlive, isOnMap, teamUnits } from '../../../core/rules';
import { effectiveStandingOrder, isDetached, squadById } from '../../../core/squads';
import { unitIconKey } from '../../../ui/sprites';
import type { DestinationFlag, DestinationMarks, FlagEmblem } from '../../ports/orders';

/** Cuantos caben en una bandera: si van mas distintos al mismo sitio, los primeros y, en el ultimo hueco, cuantos mas van. */
export const MAX_EMBLEMS = 3;
/** La inicial de una escuadra sin nombre (no deberia pasar: los nombres se limpian al ponerlos). */
const NO_NAME = '?';

/**
 * Una unidad de camino: a donde va, quien la lleva (`who`: su escuadra, o su tipo si va por su cuenta;
 * cada uno sale una vez en la bandera) y como se ve (dos escuadras sin tecla con la misma inicial se ven
 * igual, pero son dos).
 */
interface Goer {
  readonly at: Pos;
  readonly who: string;
  readonly emblem: FlagEmblem;
}

/** A donde va esa unidad con su orden, si aun no esta alli. */
function destinationOf(s: GameState, unit: Unit): Pos | undefined {
  const order = effectiveStandingOrder(s, unit);
  if (!order || (isOnMap(unit) && samePos(unit, order.at))) return undefined;
  return order.at;
}

/** Lo que se ve de una escuadra: su tecla de grupo (1-9) o, si no tiene, la inicial de su nombre. */
const squadLabel = (squad: Squad): string => (squad.key !== undefined ? String(squad.key) : squad.name.charAt(0).toUpperCase() || NO_NAME);

/** Esa unidad, que va a `at`: la lleva su escuadra si cumple la orden de la escuadra; si no, va ella (la imagen de su tipo). */
function goerOf(s: GameState, unit: Unit, at: Pos): Goer {
  const squad = squadById(s, unit.squad);
  if (squad?.standingOrder && !isDetached(s, unit)) {
    return { at, who: `squad ${squad.id}`, emblem: { kind: 'squad', label: squadLabel(squad) } };
  }
  const image = unitIconKey(unitTypeOf(s, unit), true);
  return { at, who: image, emblem: { kind: 'unit', image } };
}

/** Las unidades vivas de ese equipo que van a algun sitio. */
function goersOf(s: GameState, team: TeamId): Goer[] {
  return teamUnits(s, team)
    .filter(isAlive)
    .flatMap((unit) => {
      const at = destinationOf(s, unit);
      return at ? [goerOf(s, unit, at)] : [];
    });
}

/** Los que caben en la bandera: si van mas de MAX_EMBLEMS, los primeros y cuantos mas van. */
function fitting(emblems: readonly FlagEmblem[]): FlagEmblem[] {
  if (emblems.length <= MAX_EMBLEMS) return [...emblems];
  const shown = emblems.slice(0, MAX_EMBLEMS - 1);
  return [...shown, { kind: 'more', count: emblems.length - shown.length }];
}

/** Una bandera por casilla de destino (varias pueden ir al mismo sitio), con quienes van, cada uno una vez. */
export function destinationFlagsOf(s: GameState, team: TeamId): DestinationFlag[] {
  const byTile = new Map<string, { at: Pos; emblems: Map<string, FlagEmblem> }>();
  for (const { at, who, emblem } of goersOf(s, team)) {
    const flag = byTile.get(posKey(at)) ?? { at, emblems: new Map<string, FlagEmblem>() };
    flag.emblems.set(who, emblem);
    byTile.set(posKey(at), flag);
  }
  return [...byTile.values()].map(({ at, emblems }) => ({ at, emblems: fitting([...emblems.values()]) }));
}

/** Pone las banderas de a donde va cada una ahora (tras cualquier cambio de la partida). */
export function showDestinations(s: GameState, viewer: TeamId, marks: DestinationMarks): void {
  marks.showFlags(destinationFlagsOf(s, viewer));
}
