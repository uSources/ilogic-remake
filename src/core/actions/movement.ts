/** Acciones de moverse: ir a una casilla este turno y el viaje de varios turnos. */
import { isOnBoard } from '../mapGrid';
import { posOf } from '../geom';
import { followPath, moveEvent, plannedPath } from '../rules/movement';
import { unitAt, unitById } from '../rules/queries';
import { readyUnit } from '../rules/unitTurn';
import type { ActionRejection, GameState, TeamId } from '../model';
import { actorProblem, checkedUnit, ownUnitProblem } from './checks';
import type { ActionRegistry } from './types';

/** Por que no se puede deshacer ahora el movimiento de `uid`: tiene que ser lo ultimo hecho y su casilla seguir libre. */
function undoProblem(s: GameState, team: TeamId, uid: number): ActionRejection | null {
  const problem = actorProblem(s, team, uid);
  if (problem) return problem;
  const lastMove = s.lastMove;
  if (!lastMove || lastMove.uid !== uid || unitById(s, uid)!.turnState !== 'moved') return 'nothingToUndo';
  return unitAt(s, lastMove.from) ? 'occupied' : null;
}

export const MOVEMENT_ACTIONS: Pick<ActionRegistry, 'move' | 'undoMove' | 'travel'> = {
  move: {
    validate: (s, team, action) => {
      const problem = actorProblem(s, team, action.uid);
      if (problem) return problem;
      return plannedPath(s, unitById(s, action.uid)!, action.to, action.path) ? null : 'unreachable';
    },
    apply: (s, _team, action) => {
      const unit = checkedUnit(s, action.uid);
      const from = posOf(unit);
      const path = plannedPath(s, unit, action.to, action.path)!;
      const walked = followPath(s, unit, path);
      // Con emboscada no hay vuelta atras: la unidad ya ha gastado su turno.
      if (!walked.ambush) s.lastMove = { uid: unit.uid, from };
      return [moveEvent(unit.uid, walked)];
    },
  },
  undoMove: {
    validate: (s, team, action) => undoProblem(s, team, action.uid),
    apply: (s, _team, action) => {
      const unit = checkedUnit(s, action.uid);
      const { from } = s.lastMove!;
      unit.x = from.x;
      unit.y = from.y;
      readyUnit(unit);
      return [];
    },
  },
  travel: {
    validate: (s, team, action) => {
      if (action.to && !isOnBoard(s, action.to)) return 'offBoard';
      return ownUnitProblem(s, team, action.uid);
    },
    apply: (s, _team, action) => {
      const unit = checkedUnit(s, action.uid);
      if (!action.to) {
        delete unit.travelTo;
        return [];
      }
      // Un viaje manda sobre la orden permanente que llevara: es lo ultimo que se le ha dicho.
      delete unit.standingOrder;
      unit.travelTo = posOf(action.to);
      return [];
    },
  },
};
