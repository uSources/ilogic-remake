/** Acciones de moverse: ir a una casilla este turno y el viaje de varios turnos. */
import { posOf } from '../geom';
import { followPath, moveEvent, plannedPath, type MovePath } from '../rules/movement';
import { buildingAt } from '../rules/queries';
import { endTravel, travelProblem, travelStepOf, type TravelStep } from '../rules/travel';
import { captureProgress } from '../rules/capture';
import { dropLastUndoableMove, forgetUndoableMoves, rememberMove, undoMoveProblem } from '../rules/undo';
import { readyUnit } from '../rules/unitTurn';
import { visibleEnemies } from '../rules/visibility';
import type { GameEvent, GameState, Pos, TeamId, UndoableMove, Unit } from '../model';
import { actorProblem, checkedUndoableMove, checkedUnit, ownUnitOnMapProblem, ownUnitProblem } from './checks';
import type { ActionRegistry } from './types';

/** La captura a medias que lleva la unidad en el edificio en el que esta (la que perderia al irse). */
function ownCaptureHere(s: GameState, unit: Unit): UndoableMove['capture'] {
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
function walkRemembering(s: GameState, team: TeamId, unit: Unit, path: Pos[], travelTo: Pos | undefined): MovePath {
  const from = posOf(unit);
  const capture = ownCaptureHere(s, unit);
  const seenBefore = visibleEnemies(s, team);
  const walked = followPath(s, unit, path);
  const revealed = [...visibleEnemies(s, team)].some((uid) => !seenBefore.has(uid));
  if (walked.ambush) forgetUndoableMoves(s);
  else rememberMove(s, { uid: unit.uid, from, capture, revealed, ...(travelTo ? { travelTo: posOf(travelTo) } : {}) });
  return walked;
}

/** Vuelve a poner el viaje que acabo un movimiento deshecho (si lo habia): su suceso. */
function resumeTravel(team: TeamId, unit: Unit, travelTo: Pos | undefined): GameEvent[] {
  if (!travelTo) return [];
  unit.travelTo = posOf(travelTo);
  return [{ kind: 'travel', actor: team, uid: unit.uid, to: posOf(travelTo) }];
}

/** El suceso de que la unidad deja su orden permanente propia (como al quitarla: 'cancelStandingOrder'). */
const standingOrderDroppedEvent = (team: TeamId, unit: Unit): GameEvent => ({
  kind: 'standingOrder',
  actor: team,
  uids: [unit.uid],
  order: null,
});

/** El paso de viaje de una accion ya comprobada (si no lo hay, es un fallo del registro). */
function checkedTravelStep(s: GameState, unit: Unit): TravelStep {
  const step = unit.travelTo && travelStepOf(s, unit, unit.travelTo);
  if (!step) throw new Error('Un paso de viaje ya comprobado sin paso');
  return step;
}

export const MOVEMENT_ACTIONS: Pick<ActionRegistry, 'move' | 'undoMove' | 'travel' | 'travelStep'> = {
  move: {
    keepsUndo: true,
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => (plannedPath(s, unit, action.to, action.path) ? null : 'unreachable')),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      // Moverla a mano cancela su viaje de varios turnos (deshacer lo devuelve).
      const travelTo = unit.travelTo;
      const cancelled = endTravel(team, unit);
      const walked = walkRemembering(s, team, unit, checkedPath(plannedPath(s, unit, action.to, action.path)), travelTo);
      return [...cancelled, moveEvent(team, unit.uid, walked)];
    },
  },
  undoMove: {
    // Deshacer el ultimo deja los de antes: se pueden deshacer uno tras otro.
    keepsUndo: true,
    // No pasa por actorProblem: la unidad ya ha actuado (se ha movido, quiza ha esperado), y eso es
    // justo lo que se deshace (undoMoveProblem mira que siga como la dejo el movimiento).
    validate: (s, team, action) => ownUnitProblem(s, team, action.uid, (unit) => undoMoveProblem(s, unit)),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const { from, capture, travelTo } = checkedUndoableMove(s);
      dropLastUndoableMove(s);
      unit.x = from.x;
      unit.y = from.y;
      readyUnit(unit);
      // [CAMBIO] Fallo K2: al irse perdia la captura a medias; al volver, la recupera.
      const building = buildingAt(s, from);
      if (building && capture) building.capture = { ...capture };
      const undone: GameEvent = { kind: 'undoMove', actor: team, uid: unit.uid, to: posOf(from) };
      return [undone, ...resumeTravel(team, unit, travelTo)];
    },
  },
  travel: {
    // Dar o quitar un viaje no cuenta nada nuevo de la partida (su paso, 'travelStep', si).
    keepsUndo: true,
    validate: (s, team, action) => {
      const goal = action.to;
      // Dejar de viajar, si viaja; empezar, solo en el mapa y hacia donde pueda ir ya (travelProblem).
      if (!goal) return ownUnitProblem(s, team, action.uid, (unit) => (unit.travelTo ? null : 'noTravel'));
      return ownUnitOnMapProblem(s, team, action.uid, (unit) => travelProblem(s, unit, goal));
    },
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      if (!action.to) return endTravel(team, unit);
      // Un viaje manda sobre la orden permanente propia que llevara: es lo ultimo que se le ha dicho.
      // Solo la propia se quita (y se cuenta): la de su escuadra sigue siendo de la escuadra, y
      // mientras viaja no la sigue (effectiveStandingOrder: el viaje manda), asi que no cambia nada.
      const orderDropped = unit.standingOrder ? [standingOrderDroppedEvent(team, unit)] : [];
      delete unit.standingOrder;
      unit.travelTo = posOf(action.to);
      return [...orderDropped, { kind: 'travel', actor: team, uid: unit.uid, to: posOf(action.to) }];
    },
  },
  travelStep: {
    // No se deshace (sin keepsUndo): lo hace el viaje solo, al empezar el turno, y deshacerlo
    // dejaria a la unidad lista y con su viaje (un movimiento gratis).
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => {
        if (!unit.travelTo) return 'noTravel';
        return travelStepOf(s, unit, unit.travelTo) ? null : 'unreachable';
      }),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const step = checkedTravelStep(s, unit);
      if (step.arrives) return endTravel(team, unit, step.end);
      const walked = followPath(s, unit, step.path);
      // El paso nunca llega al destino (si llegara este turno, seria 'withinReach'): solo una emboscada lo acaba.
      return [moveEvent(team, unit.uid, walked), ...(walked.ambush ? endTravel(team, unit, 'ambush') : [])];
    },
  },
};
