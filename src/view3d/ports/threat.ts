/**
 * Lo que la amenaza (systems/threat) pide al motor: marcar las casillas a las que puede disparar
 * algun enemigo que se ve y las lineas de quien podria atacar a una unidad. Lo implementan
 * engine/fx/highlights.ts (las casillas) y engine/fx/threatLines.ts (las lineas).
 */
import type { Pos } from '../../core/model';

/** Un enemigo (`from`) que podria atacar en su turno a la unidad de `to`. */
export interface ThreatLine {
  readonly from: Pos;
  readonly to: Pos;
}

export interface ThreatMarks {
  /** Marca estas casillas (vacio: ninguna). */
  showThreat(tiles: readonly Pos[]): void;
  /** Una linea roja por cada enemigo que podria atacar (vacio: ninguna). */
  showThreatLines(lines: readonly ThreatLine[]): void;
}
