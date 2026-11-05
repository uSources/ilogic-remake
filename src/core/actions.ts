/**
 * Acciones: la unica forma de cambiar una partida. Quien juega un equipo (la persona en la pantalla,
 * la IA, la partida por texto, una herramienta) manda una `GameAction` (datos: uids y casillas) con
 * `dispatch(s, team, action)`, que la comprueba y la hace, y recibe sus sucesos para animarlos.
 * Fuera del nucleo se importa de aqui; el codigo esta en `actions/`, un modulo por tema:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `types` | la forma de una entrada del registro (`ActionDefinition`: validate y apply) |
 * | `guards` | lo que se mira antes de cualquier accion: su forma y que la mande un equipo de la partida (`ACTION_GUARDS`) |
 * | `shape` | la forma de cada accion (`ACTION_SHAPES`, `isGameAction`): uids enteros, casillas bien formadas |
 * | `checks` | comprobaciones de las unidades de una accion: existen, son del equipo, aun pueden actuar |
 * | `movement` | mover, viaje de varios turnos |
 * | `combat` | atacar (el combate entero) |
 * | `capture` | capturar |
 * | `transport` | unirse, subir y bajar de un transporte |
 * | `units` | esperar, reparar, retirar una unidad |
 * | `economy` | comprar |
 * | `powers` | poderes del general |
 * | `standingOrders` | dar, quitar y cumplir ordenes permanentes |
 * | `squads` | escuadras y grupos por tecla |
 * | `menu` | los menus, sacados de las acciones que valen: el de una unidad (`availableActions`) y lo que se manda a unas elegidas (`canDoWithSelection`) |
 * | `registry` | `ACTIONS`: todas las entradas |
 * | `dispatch` | `dispatch`, `actionProblem`, `isValidAction` |
 */
export { dispatch, actionProblem, isValidAction } from './actions/dispatch';
export { ACTIONS } from './actions/registry';
export {
  availableActions,
  canDoWithSelection,
  groupMoveOrder,
  groupMoveStep,
  ORDER_OPTIONS,
  SELECTION_MENU,
  UNIT_MENU,
  type SelectionOption,
  type UnitMenuOption,
} from './actions/menu';
export { ACTION_GUARDS, type ActionGuard } from './actions/guards';
export { ACTION_SHAPES, isGameAction } from './actions/shape';
export type { ActionDefinition, ActionRegistry } from './actions/types';
export type { ActionRejection, ActionResult, GameAction, GameActionKind, GameActionOf } from './model';
