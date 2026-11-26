/**
 * «Acabar turno» con unidades sin mover (docs/PLAN-INTERFAZ-2.md, fase 6): la primera pulsacion no
 * termina, hace saltar a esas unidades en el tablero (para que se vean) y el boton pasa a «¿Terminar?»;
 * la segunda, si llega a tiempo, termina. Sin unidades sin mover, termina a la primera. Solo decide:
 * el salto se pide al motor (`PieceStage.hop`) y el reloj llega de fuera (se prueba sin esperar).
 */
import type { GameState, TeamId, Unit } from '../../../core/model';
import { canActNow, isOnMap } from '../../../core/rules';
import type { PieceStage } from '../../ports/stage';

/** Lo que dura «¿Terminar?» esperando la segunda pulsacion (ms); el mismo que el de salir de la partida. */
export const END_CONFIRM_MS = 2500;

export interface EndTurnGuardHost {
  readonly s: GameState;
  readonly viewer: TeamId;
  readonly pieces: Pick<PieceStage, 'hop'>;
  /** Termina el turno de verdad. */
  endTurn(): void;
  /** Se ha armado o desarmado: que la interfaz lo vuelva a pintar. */
  changed(): void;
  /** Ahora (ms) y esperar (para desarmarse sola). */
  now(): number;
  later(ms: number, run: () => void): void;
}

/** Las unidades de quien mira que aun pueden hacer algo y estan en el tablero (las que saltan). */
export const idleUnitsOf = (s: GameState, viewer: TeamId): Unit[] =>
  s.units.filter((unit) => unit.team === viewer && canActNow(unit) && isOnMap(unit));

export class EndTurnGuard {
  private armedAt = -Infinity;

  constructor(private readonly host: EndTurnGuardHost) {}

  /** Esperando la segunda pulsacion (el boton dice «¿Terminar?»). */
  get isArmed(): boolean {
    return this.host.now() - this.armedAt < END_CONFIRM_MS;
  }

  press(): void {
    const { host } = this;
    const idle = idleUnitsOf(host.s, host.viewer);
    if (!idle.length || this.isArmed) return this.end();
    this.armedAt = host.now();
    for (const unit of idle) void host.pieces.hop(unit.uid);
    host.changed();
    host.later(END_CONFIRM_MS, () => host.changed());
  }

  private end(): void {
    this.armedAt = -Infinity;
    this.host.endTurn();
    this.host.changed();
  }
}
