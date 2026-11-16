/**
 * La barra de acciones de la unidad elegida (sustituye al menu de la unidad): solo lo que vale ahora
 * con esa unidad donde esta (el nucleo lo dice: availableActions) y no se hace ya con un clic en el
 * tablero (atacar es tocar un enemigo en rojo). Mas «Deshacer» si lo ultimo fue moverla. Puro.
 */
import { availableActions, type UnitMenuOption } from '../../../core/actions';
import type { GameAction, GameState, TeamId, Unit } from '../../../core/model';
import { lastUndoableMove } from '../../../core/rules';

/** Una accion de la barra: las del nucleo que salen en ella y deshacer el movimiento. */
export type BarOption = Extract<UnitMenuOption, 'capture' | 'unload' | 'supply' | 'wait' | 'delete'> | 'undo';

/** Las del nucleo que van en la barra, en su orden (las ordenes, con las escuadras). */
const CORE_OPTIONS: readonly UnitMenuOption[] = ['capture', 'unload', 'supply', 'wait', 'delete'];

const isBarOption = (option: UnitMenuOption): option is Exclude<BarOption, 'undo'> => CORE_OPTIONS.includes(option);

/** Lo que ofrece la barra de esa unidad ahora; «Deshacer» va antes de retirarla (la de peligro, al final). */
export function barOptions(s: GameState, viewer: TeamId, unit: Unit): BarOption[] {
  const options: BarOption[] = availableActions(s, viewer, unit).filter(isBarOption);
  if (lastUndoableMove(s)?.uid !== unit.uid) return options;
  const dangerAt = options.indexOf('delete');
  const cut = dangerAt < 0 ? options.length : dangerAt;
  return [...options.slice(0, cut), 'undo', ...options.slice(cut)];
}

/** Las de la barra que se cumplen con una sola accion, sin elegir nada mas. */
export const SINGLE_ACTIONS: { readonly [Option in BarOption]?: (unit: Unit) => GameAction } = {
  capture: (unit) => ({ kind: 'capture', uid: unit.uid }),
  supply: (unit) => ({ kind: 'supply', uid: unit.uid }),
  wait: (unit) => ({ kind: 'wait', uid: unit.uid }),
  delete: (unit) => ({ kind: 'deleteUnit', uid: unit.uid }),
  undo: (unit) => ({ kind: 'undoMove', uid: unit.uid }),
};
