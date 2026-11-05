/**
 * La unica via para cambiar una partida: `dispatch(s, team, action)`. Comprueba la accion contra la
 * partida (las comprobaciones comunes, ACTION_GUARDS, y su `validate`), la hace (su `apply`, con los dados de la partida) y repasa las INVARIANTS.
 * La usan la escena, la IA, la partida por texto y las herramientas; un cliente remoto o una
 * repeticion mandarian lo mismo.
 */
import { diceOf } from '../dice';
import type { ActionRejection, ActionResult, Dice, GameAction, GameActionKind, GameActionOf, GameEvent, GameState, TeamId } from '../model';
import { guardProblem } from './guards';
import { restoreInvariants } from './invariants';
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

/** Hace la accion ya comprobada (su `apply`) y deja la partida en orden (INVARIANTS). */
function applyAction(s: GameState, team: TeamId, action: GameAction, dice: Dice): GameEvent[] {
  const events = definitionOf(action).apply(s, team, action, dice);
  restoreInvariants(s, action);
  return events;
}

/**
 * El equipo `team` hace la accion: si vale, cambia la partida y devuelve sus sucesos; si no, no toca
 * nada y dice por que.
 */
export function dispatch(s: GameState, team: TeamId, action: GameAction): ActionResult {
  const reason = actionProblem(s, team, action);
  if (reason) return { ok: false, reason };
  return { ok: true, events: applyAction(s, team, action, diceOf(s)) };
}
