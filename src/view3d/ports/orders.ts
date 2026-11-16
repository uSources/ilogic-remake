/**
 * Lo que las ordenes permanentes (systems/orders) piden al motor: enseñar lo que hara cada unidad con
 * orden al terminar el turno. Lo implementa engine/fx/intentArrows.ts.
 */
import type { Pos } from '../../core/model';

/** Lo que hara una unidad con orden: su camino de este turno y, si acaso, a quien ataca o que captura. */
export interface IntentLook {
  readonly path: readonly Pos[];
  readonly attack?: Pos;
  readonly capture?: Pos;
}

export interface IntentMarks {
  /** Enseña estas (vacio: ninguna). */
  show(intents: readonly IntentLook[]): void;
}
