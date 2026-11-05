/** Acciones de moverse: ir a una casilla este turno y el viaje de varios turnos. */
import { isOnBoard } from '../mapGrid';
import { posOf } from '../geom';
import { followPath, moveEvent, plannedPath } from '../rules/movement';
import { buildingAt, unitAt, unitById } from '../rules/queries';
import { captureProgress } from '../rules/capture';
import { readyUnit } from '../rules/unitTurn';
import type { ActionRejection, GameState, LastMove, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit, ownUnitProblem } from './checks';
import type { ActionRegistry } from './types';

/** La captura a medias que lleva la unidad en el edificio en el que esta (la que perderia al irse). */
function ownCaptureHere(s: GameState, unit: Unit): LastMove['capture'] {
  const building = buildingAt(s, unit);
  const progress = building && captureProgress(s, building);
  return progress && progress.uid === unit.uid ? { ...progress } : null;
}

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
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const from = posOf(unit);
      const capture = ownCaptureHere(s, unit);
      const path = plannedPath(s, unit, action.to, action.path)!;
      const walked = followPath(s, unit, path);
      // Con emboscada no hay vuelta atras: la unidad ya ha gastado su turno.
      if (!walked.ambush) s.lastMove = { uid: unit.uid, from, capture };
      return [moveEvent(team, unit.uid, walked)];
    },
  },
  undoMove: {
    validate: (s, team, action) => undoProblem(s, team, action.uid),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const { from, capture } = s.lastMove!;
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
      if (action.to && !isOnBoard(s, action.to)) return 'offBoard';
      return ownUnitProblem(s, team, action.uid);
    },
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const travelled = { kind: 'travel', actor: team, uid: unit.uid, to: action.to && posOf(action.to) } as const;
      if (!action.to) {
        delete unit.travelTo;
        return [travelled];
      }
      // Un viaje manda sobre la orden permanente que llevara: es lo ultimo que se le ha dicho.
      delete unit.standingOrder;
      unit.travelTo = posOf(action.to);
      return [travelled];
    },
  },
};
