/**
 * El controlador que decide con la IA del juego (`aiController`: la IA rival, o la de referencia de
 * la arena).
 *
 * La IA aun manda ella sus acciones (las decide mirando cada resultado: fase 6, que la convertira en
 * un controlador que solo las propone); se le da un `ActionDispatcher` que las apunta y la sesion
 * las recibe como pasos 'applied'. Asi quedan en el registro de la sesion igual que las demas.
 * Empezar y acabar el turno son de la sesion: si la IA los mandara, no valen ('sessionOnly').
 */
import { dispatch } from '../actions/dispatch';
import { isTurnBoundary } from '../actions/turn';
import type { ActionDispatcher } from '../actions/types';
import { aiTurn } from '../ai';
import type { GameEvent, GameState, Rng, TeamId } from '../model';
import type { Controller, TurnPlan, TurnStep } from '../session/controller';

/** Una IA: el turno de un equipo, mandando sus acciones por `dispatcher` (la de `aiTurn` o la de referencia de la arena). */
export type AiBrain = (s: GameState, rng: Rng, team: TeamId, dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>;

/**
 * El turno de alguien que manda sus acciones el mismo (`run`, con el dispatcher que se le da): cada
 * accion que manda sale como un paso 'applied', en cuanto la manda.
 */
function* selfDispatched(run: (dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>): TurnPlan {
  const sent: TurnStep[] = [];
  const recording: ActionDispatcher = (s, team, action) => {
    if (isTurnBoundary(action)) return { ok: false, reason: 'sessionOnly' };
    const result = dispatch(s, team, action);
    sent.push({ kind: 'applied', action, result });
    return result;
  };
  const turn = run(recording);
  for (let step = turn.next(); !step.done; step = turn.next()) yield* sent.splice(0);
  yield* sent.splice(0);
}

/** La IA del juego (o otra con la misma forma, `brain`), que decide con su azar `rng`. */
export const aiController = (rng: Rng, brain: AiBrain = aiTurn): Controller => ({
  name: 'ai',
  playTurn: (s, team) => selfDispatched((dispatcher) => brain(s, rng, team, dispatcher)),
});
