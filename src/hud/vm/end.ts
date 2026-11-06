import type { BySide } from './common';

/** Pantalla final: lo que ha hecho la alianza de quien mira y lo que han hecho sus enemigos, juntos. */

export interface EndStatsVM {
  built: BySide;
  spent: BySide;
  /** Unidades perdidas. */
  lost: BySide;
  /** Edificios ganados o neutralizados. */
  captured: BySide;
}

/** Como ha acabado la partida para quien mira: su alianza gana, pierde o nadie gana (empate). */
export type EndOutcome = 'won' | 'lost' | 'draw';
