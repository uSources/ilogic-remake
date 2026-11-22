/**
 * Lo que las ordenes permanentes (systems/orders) piden al motor: enseñar lo que hara cada unidad con
 * orden al terminar el turno (lo implementa engine/fx/intentArrows.ts) y a donde va cada una (la
 * bandera de su destino: engine/fx/destinationFlags.ts).
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

/**
 * Quien va a una bandera: una unidad por su cuenta (la imagen de su tipo, clave del atlas), una escuadra
 * (su tecla o su inicial) o, en el ultimo hueco si no caben todos, cuantos mas van.
 */
export type FlagEmblem =
  | { readonly kind: 'unit'; readonly image: string }
  | { readonly kind: 'squad'; readonly label: string }
  | { readonly kind: 'more'; readonly count: number };

/** Una bandera: la casilla a la que van y quienes van (uno por escuadra o tipo de unidad). */
export interface DestinationFlag {
  readonly at: Pos;
  readonly emblems: readonly FlagEmblem[];
}

export interface DestinationMarks {
  /** Estas banderas: a donde van las unidades propias con orden (vacio: ninguna). */
  showFlags(flags: readonly DestinationFlag[]): void;
}
