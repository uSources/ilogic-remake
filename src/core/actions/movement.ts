/** Acciones de moverse: ir a una casilla este turno, deshacerlo y el paso de cada turno de la orden de ir alli. */
import { posOf } from '../geom';
import { plannedPath } from '../rules/movement';
import { moveAlong, moveEvent, type Traversal } from '../rules/traverse';
import { buildingAt } from '../rules/queries';
import { endGotoByHand, finishGoto, travelStepOf, type TravelStep } from '../rules/travel';
import { captureProgress } from '../rules/capture';
import { dropLastUndoableMove, forgetUndoableMoves, rememberMove, undoMoveProblem } from '../rules/undo';
import { readyUnit } from '../rules/unitTurn';
import { visibleEnemies } from '../rules/visibility';
import type { ActionRegistry, GameEvent, GameState, Pos, TeamId, UndoableMove, Unit } from '../model';
import { actorProblem, checkedUndoableMove, checkedUnit, ownUnitProblem } from './checks';
import { gotoDestination } from '../squads/standingOrders';

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
function walkRemembering(s: GameState, team: TeamId, unit: Unit, path: Pos[], goto: Pos | undefined): Traversal {
  const from = posOf(unit);
  const capture = ownCaptureHere(s, unit);
  const seenBefore = visibleEnemies(s, team);
  const walked = moveAlong(s, unit, path);
  const revealed = [...visibleEnemies(s, team)].some((uid) => !seenBefore.has(uid));
  if (walked.interruption) forgetUndoableMoves(s);
  else rememberMove(s, { uid: unit.uid, from, capture, revealed, ...(goto ? { goto: posOf(goto) } : {}) });
  return walked;
}

/** Vuelve a poner la orden de ir alli que acabo un movimiento deshecho (si la habia): su suceso. */
function resumeGoto(team: TeamId, unit: Unit, goto: Pos | undefined): GameEvent[] {
  if (!goto) return [];
  unit.standingOrder = { kind: 'goto', at: posOf(goto) };
  return [{ kind: 'standingOrder', actor: team, uids: [unit.uid], order: { kind: 'goto', at: posOf(goto) } }];
}

/** El paso de la orden de ir alli de una accion ya comprobada (si no lo hay, es un fallo del registro). */
function checkedGotoStep(s: GameState, unit: Unit): TravelStep {
  const goal = gotoDestination(unit);
  const step = goal && travelStepOf(s, unit, goal);
  if (!step) throw new Error('Un paso de ir alli ya comprobado sin paso');
  return step;
}

export const MOVEMENT_ACTIONS: Pick<ActionRegistry, 'move' | 'undoMove' | 'gotoStep'> = {
  move: {
    keepsUndo: true,
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => (plannedPath(s, unit, action.to, action.path) ? null : 'unreachable')),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      // Moverla a mano acaba su orden de ir alli (deshacer la devuelve).
      const goto = gotoDestination(unit);
      const cancelled = endGotoByHand(team, unit);
      const walked = walkRemembering(s, team, unit, checkedPath(plannedPath(s, unit, action.to, action.path)), goto);
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
      const { from, capture, goto } = checkedUndoableMove(s);
      dropLastUndoableMove(s);
      unit.x = from.x;
      unit.y = from.y;
      readyUnit(unit);
      // [CAMBIO] Fallo K2: al irse perdia la captura a medias; al volver, la recupera.
      const building = buildingAt(s, from);
      if (building && capture) building.capture = { ...capture };
      const undone: GameEvent = { kind: 'undoMove', actor: team, uid: unit.uid, to: posOf(from) };
      return [undone, ...resumeGoto(team, unit, goto)];
    },
  },
  gotoStep: {
    // No se deshace (sin keepsUndo): lo da la orden sola, al empezar el turno, y deshacerlo
    // dejaria a la unidad lista y con su orden (un movimiento gratis).
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => {
        const goal = gotoDestination(unit);
        if (!goal) return 'noStandingOrder';
        return travelStepOf(s, unit, goal) ? null : 'unreachable';
      }),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const step = checkedGotoStep(s, unit);
      if (step.arrives) return finishGoto(team, unit, step.end);
      const walked = moveAlong(s, unit, step.path);
      // El paso nunca llega al destino (si llegara este turno, seria 'withinReach'): solo un corte del camino lo acaba.
      return [moveEvent(team, unit.uid, walked), ...(walked.interruption ? finishGoto(team, unit, walked.interruption.kind) : [])];
    },
  },
};
