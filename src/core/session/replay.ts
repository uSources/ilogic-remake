/**
 * Repetir lo que se ha jugado: un controlador que, turno a turno, vuelve a proponer las acciones
 * apuntadas en el registro de una sesion (`GameSession.log`). Con la misma partida de antes, sale lo
 * mismo: los dados van en la partida. Empezar y acabar los turnos lo hace la sesion que repite.
 */
import type { GameAction, GameState, TeamId } from '../model';
import { isTurnBoundary } from '../actions/turn';
import { propose, type Controller } from './controller';

/** Una accion apuntada: quien la mando y cual. */
export interface LoggedAction {
  team: TeamId;
  action: GameAction;
}

/**
 * Repite `log` desde el principio: un solo controlador para todos los equipos, que va leyendo el
 * registro en orden (ver replayControllers). En el turno de cada equipo propone sus acciones
 * apuntadas hasta su 'endTurn' (empezar y acabar los turnos lo hace la sesion que repite).
 */
export function replayController(log: readonly LoggedAction[]): Controller {
  let next = 0;
  /**
   * Lleva la lectura al turno de `team`: si ya esta en medio de el (se repite desde la mitad de un
   * turno), sigue; si no, justo despues de su siguiente 'startTurn'. Asi se salta lo que quedo sin
   * hacer de un turno que la sesion corto (un equipo que cae en su propio turno lo pasa).
   */
  const readTurnOf = (team: TeamId) => {
    const entry = log[next];
    if (entry?.team === team && entry.action.kind !== 'startTurn') return;
    const start = log.findIndex((candidate, at) => at >= next && candidate.team === team && candidate.action.kind === 'startTurn');
    next = start < 0 ? log.length : start + 1;
  };
  return {
    name: 'replay',
    playTurn: function* (_s, team) {
      readTurnOf(team);
      for (let entry = log[next]; entry && entry.team === team && !isTurnBoundary(entry.action); entry = log[next]) {
        next++;
        yield* propose(entry.action);
      }
    },
  };
}

/** Los controladores de una sesion que repite `log` en la partida `s`: el mismo para todos (lee el registro en orden). */
export function replayControllers(s: GameState, log: readonly LoggedAction[]): Controller[] {
  const replay = replayController(log);
  return s.teams.map(() => replay);
}
