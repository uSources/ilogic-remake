/**
 * Menu de bocadillo de la fase actual (pausa, unidad, compra, grupo, ordenes de una casilla, carga).
 * Funcion pura: la escena le pasa lo que hay elegido y publica el resultado en el store. Cada menu
 * esta en la entrada de su fase en PHASES (`menu`).
 */
import type { BuyOption } from '../../core/rules';
import type { Building, GameState, Pos, TeamId, Unit } from '../../core/model';
import type { ActionCtx, ActionId } from '../../controls/actions';
import { wrappedStep } from '../../controls/menu';
import type { MenuItemVM, MenuVM } from '../../hud/store';
import { PHASES } from './phases';
import type { ActionKey, Phase } from './types';

export interface MenuInput {
  s: GameState;
  /** El equipo que mira (el que compra, ordena...). */
  viewer: TeamId;
  phase: Phase;
  cursor: Pos;
  /** Unidad elegida (menu de la unidad, carga). */
  selected: Unit | null;
  /** Opciones del menu de la unidad, ya ordenadas. */
  actions: readonly ActionKey[];
  /** Fabrica de la compra y lo que se puede comprar en ella. */
  building: Building | null;
  buy: readonly BuyOption[];
  /** Unidades del grupo elegido (menu de grupo). */
  groupUnits: () => Unit[];
  /** Contexto de las acciones sin casilla con lo elegido (menu de grupo). */
  groupCtx: () => ActionCtx | null;
  /** Menu de ordenes de una casilla (fase 'orderMenu'). */
  orderMenu: { at: Pos; uids: readonly number[]; ids: readonly ActionId[] } | null;
  /** Hay un turno enemigo que repetir. */
  canReplay: boolean;
}

/** El menu sin colocar: `at` es la casilla junto a la que va el bocadillo. */
export type MenuModel = Omit<MenuVM, 'selected' | 'anchor'> & { at: Pos };

export function menuModel(input: MenuInput): MenuModel {
  return PHASES[input.phase].menu?.(input) ?? { kind: 'game', items: [], at: input.cursor };
}

/**
 * Opcion a la que se pasa con arriba (-1) o abajo (+1), dando la vuelta. Se saltan las desactivadas
 * salvo con `canPointDisabled` (en la compra se ven, aunque no se puedan pagar).
 */
export function stepMenuRow(items: readonly MenuItemVM[], from: number, step: number, canPointDisabled: boolean): number {
  const count = items.length;
  let row = from;
  for (let tries = 0; tries < count; tries++) {
    row = wrappedStep(row, step, count);
    if (!items[row]?.disabled || canPointDisabled) break;
  }
  return row;
}

/** La fase tiene un menu de bocadillo abierto. */
export const hasMenu = (phase: Phase): boolean => PHASES[phase].menu !== undefined;
