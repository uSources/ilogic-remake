/**
 * Menu de bocadillo de la fase actual (pausa, unidad, compra, grupo, ordenes de una casilla, carga).
 * Funcion pura: la escena le pasa lo que hay elegido y publica el resultado en el store. Cada menu
 * esta en la entrada de su fase en PHASES (`menu`).
 */
import type { BuyOption } from '../../core/rules';
import type { Building, GameState, Pos, Unit } from '../../core/types';
import type { ActionCtx, ActionId } from '../../controls/actions';
import type { MenuVM } from '../../hud/store';
import { PHASES } from './phases';
import type { ActionKey, Phase } from './types';

export interface MenuInput {
  s: GameState;
  phase: Phase;
  cursor: Pos;
  /** Unidad elegida (menu de la unidad, carga). */
  sel: Unit | null;
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

/** La fase tiene un menu de bocadillo abierto. */
export const hasMenu = (phase: Phase): boolean => PHASES[phase].menu !== undefined;
