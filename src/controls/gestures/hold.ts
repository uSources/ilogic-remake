/**
 * Mantener pulsado: con el dedo, levantar la unidad de debajo o (en una casilla sin unidad) la
 * pulsacion larga que lleva el cursor ahi. Los dos son un temporizador que se cancela si el gesto
 * resulta ser otra cosa.
 */
import type { Later } from './basics';

/** Con el dedo, mantener pulsado este tiempo (ms) para levantar la unidad. */
export const PICK_HOLD_MS = 250;
/** Mantener pulsado este tiempo (ms) para llevar el cursor ahi (ficha de informacion). */
export const LONG_PRESS_MS = 480;

/** Un temporizador que puede estar puesto o no; ponerlo otra vez cancela el anterior. */
export class TimerSlot {
  private pending: Later | null = null;

  /** `schedule` programa la llamada que recibe (con el temporizador de la escena). */
  start(schedule: (fire: () => void) => Later, fn: () => void): void {
    this.cancel();
    this.pending = schedule(() => {
      this.pending = null;
      fn();
    });
  }

  cancel(): void {
    this.pending?.cancel();
    this.pending = null;
  }
}
