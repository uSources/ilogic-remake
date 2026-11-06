/**
 * Los controladores que deciden con la IA del juego: la IA rival (`aiController`) y el piloto
 * automatico de las ordenes permanentes (`standingOrderAutopilot`: las cumple ya, en el turno; al
 * acabarlo las cumple la partida igual, TURN_END_PHASES).
 *
 * La IA aun manda ella sus acciones (las decide mirando cada resultado: fase 6, que la convertira en
 * un controlador que solo las propone); se le da un `ActionDispatcher` que las apunta y la sesion
 * las recibe como pasos 'applied'. Asi quedan en el registro de la sesion igual que las demas.
 */
import { dispatch } from '../actions/dispatch';
import type { ActionDispatcher } from '../actions/types';
import { aiTurn, assistTurn } from '../ai';
import type { GameEvent, GameState, Rng, TeamId } from '../model';
import type { Controller, TurnPlan, TurnStep } from './controller';

/** Una IA: el turno de un equipo, mandando sus acciones por `dispatcher` (la de `aiTurn` o la de referencia de la arena). */
export type AiBrain = (s: GameState, rng: Rng, team: TeamId, dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>;

/**
 * El turno de alguien que manda sus acciones el mismo (`run`, con el dispatcher que se le da): cada
 * accion que manda sale como un paso 'applied', en cuanto la manda.
 */
function* selfDispatched(run: (dispatcher: ActionDispatcher) => Iterator<GameEvent, unknown>): TurnPlan {
  const sent: TurnStep[] = [];
  const recording: ActionDispatcher = (s, team, action) => {
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

/** [CAMBIO] Las unidades con orden permanente que siguen sin usar la cumplen (ai/standingOrders.ts). */
export const standingOrderAutopilot = (): Controller => ({
  name: 'autopilot',
  playTurn: (s, team) => selfDispatched((dispatcher) => assistTurn(s, team, dispatcher)),
});
