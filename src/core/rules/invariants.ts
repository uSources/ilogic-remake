/**
 * Lo que tiene que ser verdad en una partida despues de cada accion y al acabar cada ronda.
 * `dispatch` y `endRound` las repasan todas, en orden, al acabar: asi ninguna accion ni ningun paso
 * de la ronda tiene que acordarse de limpiar lo que deja atras (una unidad muerta, una captura cuya
 * unidad se ha ido, una escuadra sin nadie, dinero de mas) ni de apuntar quien ha caido. Una regla nueva que deje algo que limpiar
 * es una entrada mas aqui.
 */
import { squadEvent } from '../squads/events';
import { pruneSquads } from '../squads/membership';
import { dropStaleCaptures } from './capture';
import { capFunds } from './funds';
import { recordFalls } from './falls';
import { removeDead } from './lifecycle';
import { dropStaleUndoableMoves } from './undo';
import type { GameEvent, GameState, TeamId } from '../model';

export interface Invariant {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /**
   * Deja la partida cumpliendola (si ya la cumple, no cambia nada). Devuelve los sucesos de lo que
   * ha cambiado (pasajeros que caen, dinero perdido por el tope), que van detras de los de la accion.
   * `actor`: el equipo de la accion (null al acabar la ronda), para los sucesos que lo nombran.
   */
  restore(s: GameState, actor: TeamId | null): GameEvent[];
}

/** En orden: quitar una unidad puede dejar una captura sin nadie o una escuadra vacia. */
export const INVARIANTS: readonly Invariant[] = [
  // Las unidades sin vida no siguen en el mapa (ni lo que llevaran dentro).
  { id: 'dead', restore: removeDead },
  // Quien ha caido con esto (sin Base, sin nada o rendido) queda apuntado: cuando y por que.
  { id: 'falls', restore: recordFalls },
  // Una captura a medias solo vale mientras su unidad sigue encima.
  { id: 'captures', restore: dropStaleCaptures },
  // Una escuadra sin unidades desaparece (y nadie se queda apuntado a una que no existe).
  { id: 'squads', restore: (s) => pruneSquads(s).map((squad) => squadEvent(s, null, squad, 'removed')) },
  // Lo que pase del maximo de dinero se pierde (botin, poderes...: venga de donde venga).
  { id: 'funds', restore: capFunds },
  // Lo que se puede deshacer es de unidades que siguen como las dejo su movimiento (si caen, o vuelven
  // a estar listas con la ronda nueva, ya no). Que otras acciones lo olviden es cosa de dispatch (keepsUndo).
  { id: 'undoWindow', restore: dropStaleUndoableMoves },
];

/** Deja la partida cumpliendo todas las INVARIANTS (ver Invariant.restore), tras una accion de `actor` o la ronda (null): sus sucesos. */
export function restoreInvariants(s: GameState, actor: TeamId | null): GameEvent[] {
  return INVARIANTS.flatMap((invariant) => invariant.restore(s, actor));
}
