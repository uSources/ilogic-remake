/**
 * Repetir lo que se ha jugado: una sesion (`replaySession`) que vuelve a hacer, en orden, lo apuntado
 * en el registro de otra (`GameSession.log`). Con la misma partida de antes, sale lo mismo: los
 * dados van en la partida. Empezar y acabar los turnos lo hace la sesion que repite; lo de cada
 * turno lo propone un controlador (el mismo para todos los equipos), y lo que un equipo mando fuera
 * de su turno entra por `offTurnFeed`, en el mismo sitio del registro. Los dos leen con el mismo
 * cursor (`LogCursor`, session/log.ts). Al acabarse el registro, la repeticion se para esperando
 * (`awaitingInput`), como la partida que se apunto: no se inventa turnos.
 */
import type { GameState } from '../model';
import { isTurnBoundary } from '../actions/turn';
import { propose, type Controller } from './controller';
import { GameSession } from './gameSession';
import { LogCursor, type LoggedAction } from './log';

/**
 * En el turno de cada equipo, propone sus acciones apuntadas hasta su 'endTurn'. Si el registro se
 * acaba antes (la partida que se apunto estaba esperando a alguien), espera: la sesion se para.
 */
function replayController(cursor: LogCursor): Controller {
  return {
    name: 'replay',
    playTurn: function* ({ team }) {
      cursor.seekTurnOf(team);
      for (let entry = cursor.peek(); entry && entry.team === team && !isTurnBoundary(entry.action); entry = cursor.peek()) {
        cursor.advance();
        yield* propose(entry.action);
      }
      if (!cursor.peek()) yield { kind: 'awaitInput' };
    },
  };
}

/** Una sesion que repite `log` desde la partida `s` (la de antes de lo apuntado). */
export function replaySession(s: GameState, log: readonly LoggedAction[]): GameSession {
  const cursor = new LogCursor(log);
  const replay = replayController(cursor);
  return new GameSession(
    s,
    s.teams.map(() => replay),
    { offTurnFeed: (state) => cursor.takeOffTurn(state) },
  );
}
