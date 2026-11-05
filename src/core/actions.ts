/**
 * Acciones: la unica forma de cambiar una partida. Quien juega un equipo (la persona en la pantalla,
 * la IA, la partida por texto, una herramienta) manda una `GameAction` (datos: uids y casillas) con
 * `dispatch(s, team, action)`, que la comprueba y la hace, y recibe sus sucesos para animarlos.
 * Fuera del nucleo se importa de aqui; el codigo esta en `actions/`, un modulo por tema:
 *
 * | Modulo | Que va |
 * |---|---|
 * | `types` | la forma de una entrada del registro (`ActionDefinition`: validate y apply) |
 * | `checks` | comprobaciones comunes: la unidad existe, es del equipo, aun puede actuar |
 * | `movement` | mover, viaje de varios turnos |
 * | `combat` | atacar (el combate entero) |
 * | `capture` | capturar |
 * | `transport` | unirse, subir y bajar de un transporte |
 * | `units` | esperar, reparar, retirar una unidad |
 * | `economy` | comprar |
 * | `powers` | poderes del general |
 * | `standingOrders` | dar, quitar y cumplir ordenes permanentes |
 * | `squads` | escuadras y grupos por tecla |
 * | `invariants` | lo que se repasa despues de cada accion (`INVARIANTS`) |
 * | `registry` | `ACTIONS`: todas las entradas |
 * | `dispatch` | `dispatch`, `actionProblem`, `isValidAction` |
 */
export { dispatch, actionProblem, isValidAction, applyAction } from './actions/dispatch';
export { ACTIONS } from './actions/registry';
/**
 * El combate de la accion 'attack' sin comprobar nada: solo para medirlo fuera de una partida (el
 * laboratorio de duelos de tools/balance, los tests del combate). Quien juega usa `dispatch`.
 */
export { resolveAttack } from './actions/combat';
export { INVARIANTS, restoreInvariants, type Invariant } from './actions/invariants';
export type { ActionDefinition, ActionRegistry } from './actions/types';
export type { ActionRejection, ActionResult, GameAction, GameActionKind, GameActionOf } from './model';
