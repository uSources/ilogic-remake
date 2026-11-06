/**
 * Repetir lo que se ha jugado: un controlador que, turno a turno, vuelve a proponer las acciones
 * apuntadas en el registro de una sesion (`GameSession.log`). Con la misma partida de antes, sale lo
 * mismo: los dados van en la partida. Empezar y acabar los turnos lo hace la sesion que repite.
 */
import type { GameAction, GameState, TeamId } from '../model';
import { propose, type Controller } from './controller';

/** Una accion apuntada: quien la mando y cual. */
export interface LoggedAction {
  team: TeamId;
  action: GameAction;
}

/** Lo que manda la sesion por su cuenta (no lo decide quien juega): no se vuelve a proponer. */
const isTurnBoundary = (entry: LoggedAction): boolean => entry.action.kind === 'startTurn' || entry.action.kind === 'endTurn';

/**
 * Repite `log` desde el principio: un solo controlador para todos los equipos, que va leyendo el
 * registro en orden (ver replayControllers). En el turno de cada equipo propone sus acciones
 * apuntadas hasta su 'endTurn'.
 */
export function replayController(log: readonly LoggedAction[]): Controller {
  let next = 0;
  const atStartOfTurn = (team: TeamId) => log[next]?.team === team && log[next]?.action.kind === 'startTurn';
  return {
    name: 'replay',
    playTurn: function* (_s, team) {
      if (atStartOfTurn(team)) next++;
      for (let entry = log[next]; entry && entry.team === team; entry = log[next]) {
        next++;
        if (isTurnBoundary(entry)) return;
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
