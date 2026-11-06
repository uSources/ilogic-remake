/**
 * Repetir lo que se ha jugado: una sesion (`replaySession`) que vuelve a hacer, en orden, lo apuntado
 * en el registro de otra (`GameSession.log`). Con la misma partida de antes, sale lo mismo: los
 * dados van en la partida. Empezar y acabar los turnos lo hace la sesion que repite; lo de cada
 * turno lo propone un controlador (el mismo para todos los equipos), y lo que un equipo mando fuera
 * de su turno entra por `offTurnFeed`, en el mismo sitio del registro. Los dos leen con el mismo
 * cursor (`LogCursor`).
 */
import type { GameState, TeamId } from '../model';
import { isTurnBoundary, startsTurn } from '../actions/turn';
import { isOffTurnAction, propose, type Controller, type LoggedAction } from './controller';
import { GameSession } from './gameSession';

/** Por donde va la lectura de un registro. Solo `advance` y los `skip...`/`seek...` la mueven. */
export class LogCursor {
  private at = 0;

  constructor(private readonly log: readonly LoggedAction[]) {}

  /** La entrada de ahora (sin moverse), o undefined al final. */
  peek(): LoggedAction | undefined {
    return this.log[this.at];
  }

  /** Pasa a la siguiente entrada. */
  advance(): void {
    this.at++;
  }

  /**
   * Pasa los limites de turno que la sesion que repite ya ha hecho en `s` (los hace ella, no se
   * proponen): el 'startTurn' del que juega si ya lo ha empezado, y el 'endTurn' de quien ya no juega.
   */
  skipBoundariesDoneBy(s: GameState): void {
    for (let entry = this.peek(); entry; entry = this.peek()) {
      const started = startsTurn(entry) && entry.team === s.turn && s.turnStarted;
      const ended = entry.action.kind === 'endTurn' && entry.team !== s.turn;
      if (!started && !ended) return;
      this.advance();
    }
  }

  /**
   * Lleva la lectura al turno de `team`: si ya esta en medio de el (se repite desde la mitad de un
   * turno), sigue; si no, justo despues de su siguiente 'startTurn'. Asi se salta lo que quedo sin
   * hacer de un turno que la sesion corto (un equipo que cae en su propio turno lo pasa).
   */
  seekTurnOf(team: TeamId): void {
    const entry = this.peek();
    if (entry?.team === team && !startsTurn(entry)) return;
    const start = this.log.findIndex((candidate, at) => at >= this.at && candidate.team === team && startsTurn(candidate));
    this.at = start < 0 ? this.log.length : start + 1;
  }

  /** Saca la entrada de ahora si llego fuera de turno en `s` (`isOffTurnAction`), o null si no. */
  takeOffTurn(s: GameState): LoggedAction | null {
    this.skipBoundariesDoneBy(s);
    const entry = this.peek();
    if (!entry || !isOffTurnAction(s, entry)) return null;
    this.advance();
    return entry;
  }
}

/** En el turno de cada equipo, propone sus acciones apuntadas hasta su 'endTurn'. */
function replayController(cursor: LogCursor): Controller {
  return {
    name: 'replay',
    playTurn: function* (_s, team) {
      cursor.seekTurnOf(team);
      for (let entry = cursor.peek(); entry && entry.team === team && !isTurnBoundary(entry.action); entry = cursor.peek()) {
        cursor.advance();
        yield* propose(entry.action);
      }
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
