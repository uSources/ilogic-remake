/**
 * La unica via para cambiar una partida: `dispatch(s, team, action)`. Comprueba la accion contra la
 * partida (las comprobaciones comunes, ACTION_GUARDS, y su `validate`), la hace (su `apply`, con
 * los dados de la partida) y repasa las INVARIANTS.
 * La usan la escena, la IA, la partida por texto y las herramientas; un cliente remoto o una
 * repeticion mandarian lo mismo.
 */
import { diceOf } from '../dice';
import type { ActionRejection, ActionResult, Dice, GameAction, GameActionKind, GameActionOf, GameEvent, GameState, TeamId } from '../model';
import { guardProblem } from './guards';
import { isGameAction } from './shape';
import { restoreInvariants } from '../rules/invariants';
import { forgetUndoableMoves } from '../rules/undo';
import { recordEvents } from '../stats';
import { ACTIONS } from './registry';
import type { ActionDefinition, ActionDispatcher } from './types';

/**
 * La entrada del registro de una accion, con su tipo. Se llama igual a todas: las que no hacen otras
 * acciones no usan `perform` (solo las de turno lo reciben, CompositeActionDefinition).
 */
type AnyDefinition<K extends GameActionKind> = Omit<ActionDefinition<K>, 'apply'> & {
  apply(s: GameState, team: TeamId, action: GameActionOf<K>, dice: Dice, perform: ActionDispatcher): GameEvent[];
};
const definitionOf = <K extends GameActionKind>(action: GameActionOf<K>): AnyDefinition<K> => ACTIONS[action.kind] as AnyDefinition<K>;

/**
 * Por que no vale ahora la accion para el equipo `team` (null = vale): las comprobaciones comunes
 * (ACTION_GUARDS) y las de la accion. No cambia nada.
 */
export function actionProblem(s: GameState, team: TeamId, action: GameAction): ActionRejection | null {
  return guardProblem(s, team, action, isAnyTime(action)) ?? definitionOf(action).validate(s, team, action);
}

/** La accion vale tambien fuera del turno de quien la manda (`ActionDefinition.anyTime`: rendirse). */
export const isAnyTime = (action: GameAction): boolean => isGameAction(action) && definitionOf(action).anyTime === true;

/** La accion vale ahora para el equipo `team`. */
export const isValidAction = (s: GameState, team: TeamId, action: GameAction): boolean => actionProblem(s, team, action) === null;

/**
 * Hace la accion ya comprobada (su `apply`), olvida lo que se podia deshacer si la accion cuenta
 * algo nuevo de la partida (sin `keepsUndo`) y deja la partida en orden (INVARIANTS).
 */
function applyAction(s: GameState, team: TeamId, action: GameAction): GameEvent[] {
  const definition = definitionOf(action);
  const applied = definition.apply(s, team, action, diceOf(s), perform);
  if (!definition.keepsUndo) forgetUndoableMoves(s);
  return [...applied, ...restoreInvariants(s)];
}

/**
 * Comprueba la accion (ACTION_GUARDS y su `validate`) y, si vale, la hace: sus sucesos, o por que no
 * vale. Es lo que hace dispatch, y lo que una accion manda dentro de la suya (los pasos de turno:
 * `CompositeActionDefinition.apply` recibe esto), con las mismas comprobaciones.
 */
function perform(s: GameState, team: TeamId, action: GameAction): ActionResult {
  const reason = actionProblem(s, team, action);
  if (reason) return { ok: false, reason };
  return { ok: true, events: applyAction(s, team, action) };
}

/**
 * El equipo `team` hace la accion: si vale, cambia la partida y devuelve sus sucesos (apuntados en
 * las estadisticas, stats.ts: todos, se animen o no, una sola vez aunque una accion mande otras); si
 * no, no toca nada y dice por que.
 */
export function dispatch(s: GameState, team: TeamId, action: GameAction): ActionResult {
  const result = perform(s, team, action);
  if (result.ok) recordEvents(s, result.events);
  return result;
}
