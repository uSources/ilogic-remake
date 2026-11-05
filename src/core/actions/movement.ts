/** Acciones de moverse: ir a una casilla este turno y el viaje de varios turnos. */
import { isOnBoard } from '../mapGrid';
import { posOf } from '../geom';
import { followPath, moveEvent, plannedPath } from '../rules/movement';
import { buildingAt, canWalk, movementOf, unitAt } from '../rules/queries';
import { captureProgress } from '../rules/capture';
import { readyUnit } from '../rules/unitTurn';
import { visibleEnemies } from '../rules/visibility';
import type { ActionRejection, GameState, LastMove, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit, ownUnitOnMapProblem, ownUnitProblem } from './checks';
import type { ActionRegistry } from './types';

/** La captura a medias que lleva la unidad en el edificio en el que esta (la que perderia al irse). */
function ownCaptureHere(s: GameState, unit: Unit): LastMove['capture'] {
  const building = buildingAt(s, unit);
  const progress = building && captureProgress(s, building);
  return progress && progress.uid === unit.uid ? { ...progress } : null;
}

/**
 * Por que no se puede deshacer ahora el movimiento de `uid`: tiene que ser lo ultimo hecho, no haber
 * descubierto a nadie y su casilla seguir libre.
 */
function undoProblem(s: GameState, team: TeamId, uid: number): ActionRejection | null {
  return actorProblem(s, team, uid, (unit) => {
    const lastMove = s.lastMove;
    if (!lastMove || lastMove.uid !== uid || unit.turnState !== 'moved') return 'nothingToUndo';
    if (lastMove.revealed) return 'revealed';
    return unitAt(s, lastMove.from) ? 'occupied' : null;
  });
}

export const MOVEMENT_ACTIONS: Pick<ActionRegistry, 'move' | 'undoMove' | 'travel'> = {
  move: {
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (unit) => (plannedPath(s, unit, action.to, action.path) ? null : 'unreachable')),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const from = posOf(unit);
      const capture = ownCaptureHere(s, unit);
      const path = plannedPath(s, unit, action.to, action.path)!;
      const seenBefore = visibleEnemies(s, team);
      const walked = followPath(s, unit, path);
      const revealed = [...visibleEnemies(s, team)].some((uid) => !seenBefore.has(uid));
      // Con emboscada no hay vuelta atras: la unidad ya ha gastado su turno.
      if (walked.ambush) delete s.lastMove;
      else s.lastMove = { uid: unit.uid, from, capture, revealed };
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
      const goal = action.to;
      // Dejar de viajar se puede siempre; empezar, solo en el mapa y hacia donde pueda pisar.
      if (!goal) return ownUnitProblem(s, team, action.uid);
      if (!isOnBoard(s, goal)) return 'offBoard';
      return ownUnitOnMapProblem(s, team, action.uid, (unit) => (canWalk(s, goal, movementOf(s, unit)) ? null : 'unreachable'));
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
