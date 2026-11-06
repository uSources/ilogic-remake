/**
 * Los controladores que deciden con la IA del juego: la IA rival (`aiController`), el piloto
 * automatico de las ordenes permanentes (`standingOrderAutopilot`) y la persona, que juega su turno
 * fuera y deja a su piloto automatico las unidades con orden (`humanController`).
 *
 * La IA aun manda ella sus acciones (las decide mirando cada resultado: fase 6, que la convertira en
 * un controlador que solo las propone); se le da un `ActionDispatcher` que las apunta y la sesion
 * las recibe como pasos 'applied'. Asi quedan en el registro de la sesion igual que las demas.
 */
import { dispatch } from '../actions/dispatch';
import type { ActionDispatcher } from '../actions/types';
import { aiTurn, assistTurn } from '../ai';
import type { GameEvent, GameState, Rng, TeamId } from '../model';
import { externalController, type Controller, type TurnPlan, type TurnStep } from './controller';

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

/**
 * Una persona en esta pantalla: juega su turno ella (la sesion la espera) y, al acabarlo, su piloto
 * automatico cumple las ordenes permanentes de las unidades que no ha usado.
 */
export const humanController = (): Controller => externalController('human', standingOrderAutopilot());

/** Un jugador por la red: la sesion espera las acciones que lleguen (y su piloto automatico va con el, alli). */
export const remoteController = (): Controller => externalController('remote');
