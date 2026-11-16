/**
 * La barra de acciones de lo elegido (sustituye a los menus de la unidad y del grupo): solo lo que vale
 * ahora (lo dice el nucleo: `availableActions` para una unidad, `canDoWithSelection` para varias) y no
 * se hace ya con un clic en el tablero (atacar es tocar un enemigo en rojo). Con una unidad, mas
 * «Deshacer» si lo ultimo fue moverla. Puro: que hace cada opcion lo cumple el turno.
 */
import { availableActions, canDoWithSelection, SELECTION_MENU, type SelectionOption, type UnitMenuOption } from '../../../core/actions';
import type { GameAction, GameState, TeamId, TurnEndOrderKind, Unit } from '../../../core/model';
import { lastUndoableMove } from '../../../core/rules';

/** Una accion de la barra: las del nucleo para una unidad o para varias, y deshacer el movimiento. */
export type BarOption = UnitMenuOption | SelectionOption | 'undo';

/** Las de una unidad, en su orden (las de varias que tambien valen para una, como sacarla de la escuadra, con `[unit]`). */
const UNIT_OPTIONS: readonly UnitMenuOption[] = [
  'capture',
  'unload',
  'supply',
  'wait',
  'orderToAttack',
  'orderToCapture',
  'orderToDefend',
  'cancelOrder',
];
const UNIT_SELECTION_OPTIONS: readonly SelectionOption[] = ['squadLeave', 'squadRename'];
/** La de peligro, al final (y «Deshacer» justo antes). */
const DANGER: UnitMenuOption = 'delete';

const GROUP_OPTIONS: readonly SelectionOption[] = [
  'orderToAttack',
  'orderToCapture',
  'orderToDefend',
  'cancelOrder',
  'squadForm',
  'squadLeave',
  'squadRename',
  'squadDisband',
];

/** Las opciones de orden con destino: despues se elige la casilla. */
export const ORDER_KINDS: { readonly [Option in BarOption]?: TurnEndOrderKind } = {
  orderToAttack: 'attack',
  orderToCapture: 'capture',
  orderToDefend: 'defend',
};

/** Lo que ofrece la barra de esa unidad ahora. */
export function barOptions(s: GameState, viewer: TeamId, unit: Unit): BarOption[] {
  const core = availableActions(s, viewer, unit);
  const own = UNIT_OPTIONS.filter((option) => core.includes(option));
  const selection = UNIT_SELECTION_OPTIONS.filter((option) => canDoWithSelection(s, viewer, [unit], option, null));
  const undo: BarOption[] = lastUndoableMove(s)?.uid === unit.uid ? ['undo'] : [];
  const danger: BarOption[] = core.includes(DANGER) ? [DANGER] : [];
  return [...own, ...selection, ...undo, ...danger];
}

/** Lo que ofrece la barra de un grupo: ordenes y escuadras (formar una pide dos o mas: un grupo ya lo es). */
export function groupBarOptions(s: GameState, viewer: TeamId, units: readonly Unit[]): BarOption[] {
  return GROUP_OPTIONS.filter((option) => canDoWithSelection(s, viewer, units, option, null));
}

/** Las de una unidad que se cumplen con una sola accion, sin elegir nada mas. */
const UNIT_ACTIONS: { readonly [Option in BarOption]?: (unit: Unit) => GameAction } = {
  capture: (unit) => ({ kind: 'capture', uid: unit.uid }),
  supply: (unit) => ({ kind: 'supply', uid: unit.uid }),
  wait: (unit) => ({ kind: 'wait', uid: unit.uid }),
  delete: (unit) => ({ kind: 'deleteUnit', uid: unit.uid }),
  undo: (unit) => ({ kind: 'undoMove', uid: unit.uid }),
};

const isSelectionOption = (option: BarOption): option is SelectionOption => Object.hasOwn(SELECTION_MENU, option);

/**
 * La accion de esa opcion con estas unidades, si se cumple de una vez (null si pide algo mas: una
 * casilla, un nombre, el pasajero que baja). Las de varias son las de la tabla del nucleo.
 */
export function barAction(s: GameState, viewer: TeamId, units: readonly Unit[], option: BarOption): GameAction | null {
  const [first] = units;
  const single = UNIT_ACTIONS[option];
  if (single && first && units.length === 1) return single(first);
  if (!isSelectionOption(option) || ORDER_KINDS[option] || option === 'squadRename') return null;
  return SELECTION_MENU[option](s, viewer, units, null)[0] ?? null;
}
