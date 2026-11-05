/**
 * Lo que tiene que ser verdad en una partida despues de cada accion y al acabar cada ronda.
 * `dispatch` y `endRound` las repasan todas, en orden, al acabar: asi ninguna accion ni ningun paso
 * de la ronda tiene que acordarse de limpiar lo que deja atras (una unidad muerta, una captura cuya
 * unidad se ha ido, una escuadra sin nadie, dinero de mas). Una regla nueva que deje algo que limpiar
 * es una entrada mas aqui.
 */
import { pruneSquads, squadRemovedEvent } from '../squads/membership';
import { dropStaleCaptures } from './capture';
import { capFunds } from './funds';
import { removeDead } from './lifecycle';
import { unitById } from './queries';
import type { GameEvent, GameState } from '../model';

export interface Invariant {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /**
   * Deja la partida cumpliendola (si ya la cumple, no cambia nada). Devuelve los sucesos de lo que
   * ha cambiado (pasajeros que caen, dinero perdido por el tope), que van detras de los de la accion.
   */
  restore(s: GameState): GameEvent[];
}

/** El ultimo movimiento solo se puede deshacer mientras su unidad sigue ahi y no ha hecho nada mas. */
function dropStaleLastMove(s: GameState): GameEvent[] {
  const lastMove = s.lastMove;
  if (lastMove && unitById(s, lastMove.uid)?.turnState !== 'moved') delete s.lastMove;
  return [];
}

/** En orden: quitar una unidad puede dejar una captura sin nadie o una escuadra vacia. */
export const INVARIANTS: readonly Invariant[] = [
  // Las unidades sin vida no siguen en el mapa (ni lo que llevaran dentro).
  { id: 'dead', restore: removeDead },
  // Una captura a medias solo vale mientras su unidad sigue encima.
  { id: 'captures', restore: dropStaleCaptures },
  // Una escuadra sin unidades desaparece (y nadie se queda apuntado a una que no existe).
  { id: 'squads', restore: (s) => pruneSquads(s).map((squad) => squadRemovedEvent(squad, null)) },
  // Lo que pase del maximo de dinero se pierde (botin, poderes...: venga de donde venga).
  { id: 'funds', restore: capFunds },
  // Lo que se puede deshacer es de una unidad que se acaba de mover (si cae, o vuelve a estar lista
  // con la ronda nueva, ya no). Que cualquier otra accion lo cierre es cosa de dispatch (keepsUndoWindow).
  { id: 'undoWindow', restore: dropStaleLastMove },
];

/** Deja la partida cumpliendo todas las INVARIANTS (ver Invariant.restore): sus sucesos. */
export function restoreInvariants(s: GameState): GameEvent[] {
  return INVARIANTS.flatMap((invariant) => invariant.restore(s));
}
