/** Acciones de moverse: ir a una casilla este turno y el viaje de varios turnos. */
import { isOnBoard } from '../mapGrid';
import { posOf, samePos } from '../geom';
import { canReach, followPath, moveEvent, moveRange, plannedPath, stepToward, type MovePath } from '../rules/movement';
import { buildingAt, canWalk, movementOf } from '../rules/queries';
import { captureProgress } from '../rules/capture';
import { checkedLastMove, closeUndoWindow, openUndoWindow, undoWindowProblem } from '../rules/lastMove';
import { readyUnit } from '../rules/unitTurn';
import { visibleEnemies } from '../rules/visibility';
import type { GameEvent, GameState, LastMove, Pos, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit, ownUnitOnMapProblem, ownUnitProblem } from './checks';
import type { ActionRegistry } from './types';

/** La captura a medias que lleva la unidad en el edificio en el que esta (la que perderia al irse). */
function ownCaptureHere(s: GameState, unit: Unit): LastMove['capture'] {
  const building = buildingAt(s, unit);
  const progress = building && captureProgress(s, building);
  return progress && progress.uid === unit.uid ? { ...progress } : null;
}

/** El camino de una accion de mover ya comprobada (si no lo hay, es un fallo del registro). */
function checkedPath(path: Pos[] | null): Pos[] {
  if (!path) throw new Error('Un movimiento ya comprobado sin camino');
  return path;
}

/**
 * La unidad recorre el camino y lo deja apuntado para deshacerlo (con la captura que pierde al irse
 * y si ha descubierto a alguien). Con emboscada no hay vuelta atras: ya ha gastado su turno.
 */
function walkRemembering(s: GameState, team: TeamId, unit: Unit, path: Pos[]): MovePath {
  const from = posOf(unit);
  const capture = ownCaptureHere(s, unit);
  const seenBefore = visibleEnemies(s, team);
  const walked = followPath(s, unit, path);
  const revealed = [...visibleEnemies(s, team)].some((uid) => !seenBefore.has(uid));
  if (walked.ambush) closeUndoWindow(s);
  else openUndoWindow(s, { uid: unit.uid, from, capture, revealed });
  return walked;
}

/** El suceso de que la unidad deja de viajar (llega, la paran o se le quita el viaje). */
const travelEnds = (team: TeamId, unit: Unit): GameEvent => ({ kind: 'travel', actor: team, uid: unit.uid, to: null });

/**
 * El paso de este turno de un viaje de varios turnos (travelTo): si ya esta o llega este turno, el
 * viaje acaba sin moverla (el ultimo trozo lo hace quien juega: puede seguir, atacar o capturar); si
 * no, la casilla del alcance que mas acerca (stepToward). Null si no hay viaje o no se acerca.
 */
function travelStepOf(s: GameState, unit: Unit): { goal: Pos; step: Pos[] | 'arrives' } | null {
  const goal = unit.travelTo;
  if (!goal) return null;
  const range = moveRange(s, unit);
  if (samePos(unit, goal) || canReach(range, goal)) return { goal, step: 'arrives' };
  const dest = stepToward(s, unit, goal, range);
  const path = dest && plannedPath(s, unit, dest);
  return path ? { goal, step: path } : null;
}

export const MOVEMENT_ACTIONS: Pick<ActionRegistry, 'move' | 'undoMove' | 'travel' | 'travelStep'> = {
  move: {
    keepsUndoWindow: true,
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => (plannedPath(s, unit, action.to, action.path) ? null : 'unreachable')),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      // Moverla a mano cancela su viaje de varios turnos.
      const cancelled = unit.travelTo ? [travelEnds(team, unit)] : [];
      delete unit.travelTo;
      const walked = walkRemembering(s, team, unit, checkedPath(plannedPath(s, unit, action.to, action.path)));
      return [...cancelled, moveEvent(team, unit.uid, walked)];
    },
  },
  undoMove: {
    validate: (s, team, action) => actorProblem(s, team, action.uid, (unit) => undoWindowProblem(s, unit)),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const { from, capture } = checkedLastMove(s);
      unit.x = from.x;
      unit.y = from.y;
      readyUnit(unit);
      // [CAMBIO] Fallo K2: al irse perdia la captura a medias; al volver, la recupera.
      const building = buildingAt(s, from);
      if (building && capture) building.capture = { ...capture };
      return [{ kind: 'undoMove', actor: team, uid: unit.uid, to: posOf(from) }];
    },
  },
  travel: {
    validate: (s, team, action) => {
      const goal = action.to;
      // Dejar de viajar se puede siempre; empezar, solo en el mapa y hacia donde pueda pisar.
      if (!goal) return ownUnitProblem(s, team, action.uid);
      if (!isOnBoard(s, goal)) return 'offBoard';
      return ownUnitOnMapProblem(s, team, action.uid, (unit) => (canWalk(s, goal, movementOf(s, unit)) ? null : 'unreachable'));
    },
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      if (!action.to) {
        delete unit.travelTo;
        return [travelEnds(team, unit)];
      }
      // Un viaje manda sobre la orden permanente que llevara: es lo ultimo que se le ha dicho.
      delete unit.standingOrder;
      unit.travelTo = posOf(action.to);
      return [{ kind: 'travel', actor: team, uid: unit.uid, to: posOf(action.to) }];
    },
  },
  travelStep: {
    // Como mover: se puede deshacer justo despues.
    keepsUndoWindow: true,
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => {
        if (!unit.travelTo) return 'noTravel';
        return travelStepOf(s, unit) ? null : 'unreachable';
      }),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const travel = travelStepOf(s, unit);
      if (!travel) throw new Error('Un paso de viaje ya comprobado sin paso');
      if (travel.step === 'arrives') {
        delete unit.travelTo;
        return [travelEnds(team, unit)];
      }
      const walked = walkRemembering(s, team, unit, travel.step);
      const events = [moveEvent(team, unit.uid, walked)];
      // Llega, o una emboscada la para: el viaje acaba.
      if (!samePos(unit, travel.goal) && !walked.ambush) return events;
      delete unit.travelTo;
      return [...events, travelEnds(team, unit)];
    },
  },
};
