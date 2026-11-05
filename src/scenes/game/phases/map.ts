/**
 * Fase 'map': el cursor libre por el mapa. Aceptar elige una unidad propia, abre la compra en una
 * fabrica, enseña el alcance de otra unidad o abre el menu de pausa; con un grupo elegido, lo mueve.
 */
import { posKey } from '../../../core/geom';
import { unitTypeOf } from '../../../core/gameContent';
import {
  buildingAt,
  canBuyAt,
  moveRange,
  reachableTiles,
  unitAt,
  unitById,
  unitThreat,
  canStillAct,
  canMoveNow,
} from '../../../core/rules';
import { squadUnits } from '../../../core/squads';
import type { Pos, TeamId, Unit } from '../../../core/model';
import { clickSelect } from '../../../controls/selection';
import type { HighlightInput, Highlights } from '../highlights';

import { openBuy } from './buy';
import { markUnits, noHighlights, type PhaseHandler, type PhaseHost } from './phase';

const isOwn = (viewer: TeamId, unit: Unit) => unit.team === viewer;

/** Con Mayusculas: añadir o quitar esta unidad de lo elegido. */
const TOGGLE_ONE = { shift: true, ctrl: false, count: 1 };

export const mapPhase: PhaseHandler = {
  accept: (host) => {
    const cursor = host.view.cursor;
    const own = unitAt(host.state, cursor);
    const picks = host.selection;
    // [CAMBIO] "Elegir varias" con el teclado: Enter sobre una unidad propia la añade o la quita.
    if (picks.multi && own && picks.selectable(own)) return picks.apply(clickSelect(picks.selection(), own, TOGGLE_ONE, () => []));
    if (picks.group.size && !picks.multi) return acceptWithGroup(host, cursor, own);
    acceptMapTile(host, cursor);
  },
  back: (host) => {
    if (host.inspectUid === null) return host.enter('gameMenu');
    host.inspectUid = null;
    host.refresh();
  },
  highlights: (input) => {
    if (input.group.size) return markUnits(input.s, input.group);
    if (input.inspectUid === null) return hoverMarks(input);
    return inspectMarks(input, input.inspectUid);
  },
};

/**
 * [CAMBIO] Con un grupo elegido: Enter sobre una de sus unidades abre sus ordenes (escuadra, atacar,
 * capturar...); sobre otra propia, la elige a ella; en otra casilla, mueve el grupo.
 */
function acceptWithGroup(host: PhaseHost, cursor: Pos, own: Unit | undefined): void {
  if (own && host.selection.group.has(own.uid)) return host.enter('groupMenu');
  if (own && host.selection.selectable(own)) return host.selection.apply(new Set([own.uid]));
  void host.moves.groupMove(cursor);
}

/** Aceptar en una casilla del mapa sin grupo elegido (tambien un toque del dedo, ver pointerInput.ts). */
export function acceptMapTile(host: PhaseHost, tile: Pos): void {
  const unit = unitAt(host.state, tile);
  if (host.inspectUid !== null) {
    // Segunda pulsacion: cerrar el alcance (o señalar otra unidad).
    const isSameUnit = unit?.uid === host.inspectUid;
    host.inspectUid = null;
    if (isSameUnit || !unit) return host.refresh();
  }
  if (unit && isOwn(host.viewer, unit) && canStillAct(unit)) return host.moves.select(unit);
  const building = buildingAt(host.state, tile);
  if (building && building.owner === host.viewer && canBuyAt(host.state, building)) return openBuy(host, building);
  if (unit && unit.carrier === null && (isOwn(host.viewer, unit) || host.visible(unit))) return host.inspect(unit);
  host.enter('gameMenu');
}

/** Solo pasando por encima de una unidad propia: su alcance en tenue y sus compañeras de escuadra. */
function hoverMarks(input: HighlightInput): Highlights {
  const marks = noHighlights();
  const unit = unitAt(input.s, input.cursor);
  if (!unit || !isOwn(input.viewer, unit) || input.othersPlaying) return marks;
  if (canMoveNow(unit)) {
    for (const tile of reachableTiles(moveRange(input.s, unit))) marks.tiles.set(posKey(tile), 'hover');
  }
  // [CAMBIO] Señalando una unidad de escuadra: se marcan sus compañeras.
  if (unit.squad === undefined) return marks;
  for (const mate of squadUnits(input.s, unit.squad))
    if (mate.uid !== unit.uid && mate.carrier === null) marks.tiles.set(posKey(mate), 'squad');
  return marks;
}

/** Alcance de una unidad señalada: adonde llega y que puede atacar en su proximo turno. */
function inspectMarks(input: HighlightInput, uid: number): Highlights {
  const marks = noHighlights();
  const unit = unitById(input.s, uid);
  if (!unit || unit.carrier !== null || (!isOwn(input.viewer, unit) && !input.visible(unit))) return { ...marks, inspectGone: true };
  // Como si fuera su turno: aunque ya se haya movido, se ve hasta donde llegaria.
  const range = moveRange(input.s, { ...unit, turnState: 'ready' });
  const threat = unitThreat(input.s, unit);
  const canMove = unitTypeOf(input.s, unit).move > 0;
  for (const { pos, value: steps } of range.steps.cells()) {
    if (canMove && steps > 0) marks.tiles.set(posKey(pos), 'reach');
    else if (threat.at(pos)) marks.tiles.set(posKey(pos), 'attack');
  }
  return marks;
}
