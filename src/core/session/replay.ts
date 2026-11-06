/**
 * Repetir lo que se ha jugado: un controlador que, turno a turno, vuelve a proponer las acciones
 * apuntadas en el registro de una sesion (`GameSession.log`). Con la misma partida de antes, sale lo
 * mismo: los dados van en la partida. Empezar y acabar los turnos lo hace la sesion que repite.
 */
import type { GameAction, GameState, TeamId } from '../model';
import { isAnyTime } from '../actions/dispatch';
import { isTurnBoundary, startsTurn } from '../actions/turn';
import { propose, type Controller } from './controller';

/** Una accion apuntada: quien la mando y cual. */
export interface LoggedAction {
  team: TeamId;
  action: GameAction;
}

/**
 * Repite `log` desde el principio: un solo controlador para todos los equipos, que va leyendo el
 * registro en orden (ver replayControllers). En el turno de cada equipo propone sus acciones
 * apuntadas hasta su 'endTurn' (empezar y acabar los turnos lo hace la sesion que repite). Lo que
 * otro equipo mando fuera de su turno (rendirse mientras jugaba otro) lo devuelve `offTurn`, en el
 * mismo sitio del registro.
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
    if (entry?.team === team && !startsTurn(entry)) return;
    const start = log.findIndex((candidate, at) => at >= next && candidate.team === team && startsTurn(candidate));
    next = start < 0 ? log.length : start + 1;
  };
  /**
   * Pasa los limites de turno que la sesion que repite ya ha hecho (los hace ella, no se proponen):
   * el 'startTurn' del que juega si ya lo ha empezado, y el 'endTurn' de quien ya no juega. Asi lo
   * que llego fuera de turno justo detras se ve en su sitio.
   */
  const skipDoneBoundaries = (s: GameState) => {
    for (let entry = log[next]; entry; entry = log[next]) {
      const started = startsTurn(entry) && entry.team === s.turn && s.turnStarted;
      const ended = entry.action.kind === 'endTurn' && entry.team !== s.turn;
      if (!started && !ended) return;
      next++;
    }
  };
  return {
    name: 'replay',
    // Una entrada de otro equipo que el que juega, de las que valen en cualquier momento: en la
    // partida llego fuera de turno (GameSession.act), y entra aqui, antes de lo que la seguia.
    offTurn: (s) => {
      skipDoneBoundaries(s);
      const entry = log[next];
      if (!entry || entry.team === s.turn || !isAnyTime(entry.action)) return null;
      next++;
      return entry;
    },
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
