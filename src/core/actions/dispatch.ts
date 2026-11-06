/**
 * La unica via para cambiar una partida: `dispatch(s, team, action)`. Comprueba la accion contra la
 * partida (las comprobaciones comunes, ACTION_GUARDS, y su `validate`), la hace (su `apply`, con
 * los dados de la partida) y repasa las INVARIANTS.
 * La usan la escena, la IA, la partida por texto y las herramientas; un cliente remoto o una
 * repeticion mandarian lo mismo.
 */
import { diceOf } from '../dice';
import type { ActionRejection, ActionResult, GameAction, GameActionKind, GameActionOf, GameEvent, GameState, TeamId } from '../model';
import { guardProblem } from './guards';
import { restoreInvariants } from '../rules/invariants';
import { forgetUndoableMoves } from '../rules/undo';
import { recordEvents } from '../stats';
import { ACTIONS } from './registry';
import type { ActionDefinition } from './types';

/** La entrada del registro de una accion, con su tipo. */
const definitionOf = <K extends GameActionKind>(action: GameActionOf<K>): ActionDefinition<K> => ACTIONS[action.kind];

/**
 * Por que no vale ahora la accion para el equipo `team` (null = vale): las comprobaciones comunes
 * (ACTION_GUARDS) y las de la accion. No cambia nada.
 */
export function actionProblem(s: GameState, team: TeamId, action: GameAction): ActionRejection | null {
  return guardProblem(s, team, action) ?? definitionOf(action).validate(s, team, action);
}

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
 * `ActionDefinition.apply` recibe esto), con las mismas comprobaciones.
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
