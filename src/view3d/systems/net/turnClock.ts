/**
 * El reloj del turno de una partida por la red con reloj: cuenta lo que le queda al turno que se ve,
 * segundo a segundo, y lo publica para la pastilla de arriba; en los ultimos segundos del turno propio
 * hace un tic suave por segundo. Que turno se ve lo dice `OnlinePlay` (`follow`), cuando atiende su
 * `turn` (no al llegar: detras de lo que se este animando). Que se pinta, `turnClockVM`
 * (ui/models/turnClock.ts); aqui solo se lleva la cuenta, con el bucle del motor: con la pestaña
 * escondida no se dibuja ni suena, y al volver se pone al dia.
 */
import type { SoundPort } from '../../../audio/sounds';
import type { GameState, TeamId } from '../../../core/model';
import { ui } from '../../../hud/store';
import type { TurnDeadline } from '../../../net/roomClient';
import { secondsLeftOf, turnClockVM } from '../../../ui/hudModels';
import { sideOf } from '../../../ui/sides';
import type { FrameListener } from '../../ports/frame';

const MS_PER_SECOND = 1000;

/** Un turno con reloj: de quien es, su dia y cuando acaba. */
export interface TimedTurn {
  team: TeamId;
  day: number;
  deadline: TurnDeadline;
}

/** Lo que el reloj pide de fuera. */
export interface TurnClockHost {
  /** La hora de aqui (ms desde 1970, la de `TurnDeadline`). */
  now(): number;
  /** Cada fotograma (devuelve como dejar de llamarlo). */
  onFrame(listener: FrameListener): () => void;
  sounds: SoundPort;
}

/**
 * Si dos son el mismo turno: el mismo equipo el mismo dia. `endsAt` no cuenta: se calcula al llegar
 * cada `turn` (la hora de aqui mas lo que le queda) y casi nunca coincide al milisegundo.
 */
const isSameTurn = (a: TimedTurn, b: TimedTurn): boolean => a.team === b.team && a.day === b.day;

export class TurnClock {
  private turn: TimedTurn | null = null;
  /** Los segundos que se enseñan (null: aun nada de este turno): solo se publica al cambiar. */
  private shownSeconds: number | null = null;
  private stopFrames: (() => void) | null = null;

  /** `s`, la partida que se ve (de quien es cada equipo para quien mira). */
  constructor(
    private readonly s: GameState,
    private readonly viewer: TeamId,
    private readonly host: TurnClockHost,
  ) {}

  /** El turno que se ve ahora, con su reloj; null: no corre ninguno (sin reloj, acabado) y la pastilla se quita. */
  follow(turn: TimedTurn | null): void {
    // El mismo turno otra vez (al volver tras un corte) sigue con el segundo que ya se ve: si no, el
    // tic de los ultimos segundos sonaria dos veces en el mismo segundo.
    if (!turn || !this.turn || !isSameTurn(turn, this.turn)) this.shownSeconds = null;
    this.turn = turn;
    if (!turn) return this.stop();
    // Una pastilla a 0:00 ya no miraba los fotogramas: el turno nuevo vuelve a contar.
    this.stopFrames ??= this.host.onFrame(() => this.update());
    this.update();
  }

  /** Si ha cambiado el segundo, se publica (y, en los ultimos del turno propio, tic). */
  private update(): void {
    const turn = this.turn;
    if (!turn) return;
    const secondsLeft = secondsLeftOf(turn.deadline.endsAt, this.host.now());
    if (secondsLeft === this.shownSeconds) return;
    this.shownSeconds = secondsLeft;
    const side = sideOf(this.s, this.viewer, turn.team);
    const clock = turnClockVM({ side, day: turn.day, secondsLeft, totalSeconds: turn.deadline.totalMs / MS_PER_SECOND });
    ui.set({ turnClock: clock });
    if (secondsLeft === 0) return this.stopCounting();
    if (clock.mood === 'hurry') this.host.sounds.play('turn_clock_tick');
  }

  /** Deja de mirar cada fotograma; la pastilla se queda como esta (a 0:00, hasta el `turn` que sigue). */
  private stopCounting(): void {
    this.stopFrames?.();
    this.stopFrames = null;
  }

  private stop(): void {
    this.stopCounting();
    ui.set({ turnClock: null });
  }
}
