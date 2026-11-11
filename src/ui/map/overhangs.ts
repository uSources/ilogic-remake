import type { Pos } from '../../core/model';

/**
 * Que tapa a que entre filas (puro, con test en tests/overhangs.test.ts).
 *
 * Los dibujos altos (arboles, ciudades, bases) sobresalen hacia la casilla de arriba. Como las
 * unidades van en una capa encima de la de edificios, una unidad que esta justo detras (una fila
 * mas arriba) se pintaba por encima de ese trozo, como si estuviera delante. La capa de lo que
 * sobresale (map/overhangLayer.ts) vuelve a pintar esos trozos por encima de esas unidades.
 */

/** Un trozo que sobresale y la unidad que tapa. */
export interface Overhang {
  /** Casilla del dibujo alto (la de su pie). */
  owner: Pos;
  /** Casilla de la unidad que queda detras (la de encima). */
  hidden: Pos;
}

/** La casilla de debajo: la de lo que puede tapar a una unidad que esta en `tile`. */
const tileInFront = (tile: Pos): Pos => ({ x: tile.x, y: tile.y + 1 });

/** Las unidades (por su casilla) que tienen delante un dibujo alto que se ve. */
export function overhangsOver(unitTiles: readonly Pos[], isTallAndVisible: (tile: Pos) => boolean): Overhang[] {
  return unitTiles.map((hidden) => ({ owner: tileInFront(hidden), hidden })).filter(({ owner }) => isTallAndVisible(owner));
}

/** El cursor esta sobre la unidad tapada: el trozo se aclara para verla y elegirla bien. */
export const isPeekedAt = (overhang: Overhang, cursor: Pos | null): boolean =>
  !!cursor && cursor.x === overhang.hidden.x && cursor.y === overhang.hidden.y;
