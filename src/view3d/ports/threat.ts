/**
 * Lo que la amenaza (systems/threat) pide al motor: marcar las casillas a las que puede disparar
 * algun enemigo que se ve. Lo implementa engine/fx/highlights.ts.
 */
import type { Pos } from '../../core/model';

export interface ThreatMarks {
  /** Marca estas casillas (vacio: ninguna). */
  showThreat(tiles: readonly Pos[]): void;
}
