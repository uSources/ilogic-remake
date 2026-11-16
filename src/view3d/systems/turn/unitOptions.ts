/**
 * Lo que se puede hacer con lo elegido, repartido como lo enseña la interfaz limpia
 * (docs/PLAN-INTERFAZ.md): al lado de la unidad, solo las **fichas** de lo que no se hace ya con un
 * clic en el tablero (capturar si ya esta encima, bajar carga, reparar); lo demas, poco frecuente,
 * en la **rueda** (clic derecho o mantener pulsado): esperar, ordenes, escuadras, deshacer y
 * disolver. Atacar, ir, subir y unirse son tocar la casilla (clickIntent.ts). Lo que vale lo dice
 * el nucleo (`availableActions` para una unidad, `canDoWithSelection` para varias). Puro: que hace
 * cada opcion lo cumple el turno.
 */
import { availableActions, canDoWithSelection, SELECTION_MENU, type SelectionOption, type UnitMenuOption } from '../../../core/actions';
import type { GameAction, GameState, Pos, TeamId, TurnEndOrderKind, Unit } from '../../../core/model';
import { buildingAt, lastUndoableMove, sightOf, visibleFoeAt } from '../../../core/rules';
import { isAlliedOwner } from '../../../core/teams';

/** Una opcion de lo elegido: las del nucleo para una unidad o para varias, y deshacer el movimiento. */
export type UnitOption = UnitMenuOption | SelectionOption | 'undo';

/** Las fichas de una unidad, en su orden: lo que no se hace tocando el tablero. */
const CHIP_OPTIONS: readonly UnitMenuOption[] = ['capture', 'unload', 'supply'];

/** La rueda de una unidad: esperar alli, ordenes y quitarla. */
const UNIT_RADIAL: readonly UnitMenuOption[] = ['wait', 'orderToAttack', 'orderToCapture', 'orderToDefend', 'cancelOrder'];
/** Las de varias que tambien valen para una sola (sacarla de su escuadra, cambiarle el nombre). */
const UNIT_SELECTION_RADIAL: readonly SelectionOption[] = ['squadLeave', 'squadRename'];
/** La de peligro, al final (y «Deshacer» justo antes). */
const DANGER: UnitMenuOption = 'delete';

const GROUP_RADIAL: readonly SelectionOption[] = [
  'orderToAttack',
  'orderToCapture',
  'orderToDefend',
  'cancelOrder',
  'squadForm',
  'squadLeave',
  'squadRename',
  'squadDisband',
];

/** Las fichas junto a esa unidad ahora (vacio: no hay nada que hacer que no sea tocar el tablero). */
export function chipOptions(s: GameState, viewer: TeamId, unit: Unit): UnitOption[] {
  const core = availableActions(s, viewer, unit);
  return CHIP_OPTIONS.filter((option) => core.includes(option));
}

/** La rueda de esa unidad ahora. */
export function radialOptions(s: GameState, viewer: TeamId, unit: Unit): UnitOption[] {
  const core = availableActions(s, viewer, unit);
  const own = UNIT_RADIAL.filter((option) => core.includes(option));
  const selection = UNIT_SELECTION_RADIAL.filter((option) => canDoWithSelection(s, viewer, [unit], option, null));
  const undo: UnitOption[] = lastUndoableMove(s)?.uid === unit.uid ? ['undo'] : [];
  const danger: UnitOption[] = core.includes(DANGER) ? [DANGER] : [];
  return [...own, ...selection, ...undo, ...danger];
}

/** La rueda de un grupo: ordenes y escuadras (formar una pide dos o mas: un grupo ya lo es). */
export function groupRadialOptions(s: GameState, viewer: TeamId, units: readonly Unit[]): UnitOption[] {
  return GROUP_RADIAL.filter((option) => canDoWithSelection(s, viewer, units, option, null));
}

/** Las opciones de orden con destino: despues se elige la casilla (o la da el clic derecho). */
export const ORDER_KINDS: { readonly [Option in UnitOption]?: TurnEndOrderKind } = {
  orderToAttack: 'attack',
  orderToCapture: 'capture',
  orderToDefend: 'defend',
};

/** Las de una unidad que se cumplen con una sola accion, sin elegir nada mas. */
const UNIT_ACTIONS: { readonly [Option in UnitOption]?: (unit: Unit) => GameAction } = {
  capture: (unit) => ({ kind: 'capture', uid: unit.uid }),
  supply: (unit) => ({ kind: 'supply', uid: unit.uid }),
  wait: (unit) => ({ kind: 'wait', uid: unit.uid }),
  delete: (unit) => ({ kind: 'deleteUnit', uid: unit.uid }),
  undo: (unit) => ({ kind: 'undoMove', uid: unit.uid }),
};

const isSelectionOption = (option: UnitOption): option is SelectionOption => Object.hasOwn(SELECTION_MENU, option);

/**
 * La accion de esa opcion con estas unidades, si se cumple de una vez (null si pide algo mas: una
 * casilla, un nombre, el pasajero que baja). Las de varias son las de la tabla del nucleo.
 */
export function optionAction(s: GameState, viewer: TeamId, units: readonly Unit[], option: UnitOption): GameAction | null {
  const [first] = units;
  const single = UNIT_ACTIONS[option];
  if (single && first && units.length === 1) return single(first);
  if (!isSelectionOption(option) || ORDER_KINDS[option] || option === 'squadRename') return null;
  return SELECTION_MENU[option](s, viewer, units, null)[0] ?? null;
}

/**
 * La orden que tiene sentido en esa casilla (clic derecho con algo elegido): un enemigo que se ve,
 * atacarlo; un edificio que no es de la alianza, capturarlo; si no, defender alli. Un enemigo que no
 * se ve cuenta como casilla vacia (no delata a nadie).
 */
export function orderForTile(s: GameState, viewer: TeamId, pos: Pos): TurnEndOrderKind {
  if (visibleFoeAt(s, viewer, pos, sightOf(s, viewer))) return 'attack';
  const building = buildingAt(s, pos);
  if (building && !isAlliedOwner(s, building.owner, viewer)) return 'capture';
  return 'defend';
}
