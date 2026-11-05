/**
 * Lo que tiene que ser verdad en una partida despues de cada accion. `dispatch` las repasa todas, en
 * orden, al acabar cada una: asi ninguna accion tiene que acordarse de limpiar lo que deja atras (una
 * unidad muerta, una captura cuya unidad se ha ido, una escuadra sin nadie). Una regla nueva que
 * deje algo que limpiar es una entrada mas aqui.
 */
import { dropStaleCaptures } from '../rules/capture';
import { capFunds } from '../rules/funds';
import { removeDead } from '../rules/lifecycle';
import { pruneSquads } from '../squads/membership';
import type { GameState } from '../model';

export interface Invariant {
  /** Nombre corto (para depurar). */
  readonly id: string;
  /** Deja la partida cumpliendola (si ya la cumple, no cambia nada). */
  restore(s: GameState): void;
}

/** En orden: quitar una unidad puede dejar una captura sin nadie o una escuadra vacia. */
export const INVARIANTS: readonly Invariant[] = [
  // Las unidades sin vida no siguen en el mapa (ni lo que llevaran dentro).
  { id: 'dead', restore: removeDead },
  // Una captura a medias solo vale mientras su unidad sigue encima.
  { id: 'captures', restore: dropStaleCaptures },
  // Una escuadra sin unidades desaparece (y nadie se queda apuntado a una que no existe).
  { id: 'squads', restore: pruneSquads },
  // Lo que pase del maximo de dinero se pierde (botin, poderes...: venga de donde venga).
  { id: 'funds', restore: capFunds },
];

/** Deja la partida cumpliendo todas las INVARIANTS. */
export function restoreInvariants(s: GameState): void {
  for (const invariant of INVARIANTS) invariant.restore(s);
}
