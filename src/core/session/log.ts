/**
 * El registro de una sesion (`GameSession.log`) y como se lee: cada entrada (`LoggedAction`), si llego
 * fuera de turno (`isOffTurnAction`) y por donde va la lectura al repetirlo (`LogCursor`).
 */
import { isAnyTime } from '../actions/dispatch';
import { startsTurn } from '../actions/turn';
import type { GameAction, GameState, TeamId } from '../model';

/** Una accion apuntada en el registro de una sesion: quien la mando y cual. */
export interface LoggedAction {
  team: TeamId;
  action: GameAction;
}

/**
 * La accion llega fuera del turno de su equipo en `s` (el turno es de otro, o el suyo aun no ha
 * empezado) y vale asi: solo las que valen en cualquier momento (rendirse). Lo preguntan la sesion
 * al aceptarla y la repeticion al buscarla en el registro.
 */
export const isOffTurnAction = (s: GameState, entry: LoggedAction): boolean =>
  isAnyTime(entry.action) && (entry.team !== s.turn || !s.turnStarted);

/** Por donde va la lectura de un registro. Mirar (`peek`) no la mueve; `advance`, `skip...`, `seek...` y `take...` si. */
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
