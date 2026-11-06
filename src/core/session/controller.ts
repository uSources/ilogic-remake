/**
 * Quien decide lo que hace un equipo en su turno: un `Controller`. La sesion (gameSession.ts) le
 * pide su turno (`playTurn`) cuando le toca y va haciendo lo que da, paso a paso (`TurnStep`):
 * - 'propose': una accion que propone (la sesion la manda con `dispatch` y le devuelve el resultado);
 * - 'applied': una accion que ya ha mandado el (la IA hasta la fase 6: decide mirando cada resultado
 *   y aun no sabe solo proponer; la sesion la apunta igual);
 * - 'awaitInput': espera a quien decide fuera (una persona en la pantalla, un jugador en la red):
 *   la sesion se para hasta que le digan que ha terminado (`GameSession.finishInput`).
 * Cuando su turno acaba (el generador termina), la sesion manda 'endTurn'. Un controlador nuevo (la
 * IA que solo propone acciones, un cliente remoto, una repeticion) es una funcion que da un
 * `Controller`: la sesion y las reglas no cambian.
 */
import type { ActionResult, GameAction, GameState, TeamId } from '../model';

/** Un paso del turno de un controlador. */
export type TurnStep =
  { kind: 'propose'; action: GameAction } | { kind: 'applied'; action: GameAction; result: ActionResult } | { kind: 'awaitInput' };

/** El turno de un equipo, paso a paso: recibe el resultado de cada accion que propone. */
export type TurnPlan = Generator<TurnStep, void, ActionResult | undefined>;

/** Que tipo de controlador es (para enseñarlo y depurar). */
export type ControllerName = 'human' | 'ai' | 'autopilot' | 'remote' | 'replay' | 'random' | 'passive' | 'sequence' | 'scripted';

export interface Controller {
  readonly name: ControllerName;
  /** El turno del equipo `team` en la partida `s`, paso a paso. */
  playTurn(s: GameState, team: TeamId): TurnPlan;
}

/** Propone una accion y da su resultado (lo que ha dicho la sesion al mandarla). */
export function* propose(action: GameAction): Generator<TurnStep, ActionResult, ActionResult | undefined> {
  const result = yield { kind: 'propose', action };
  if (!result) throw new Error('La sesion no ha devuelto el resultado de una accion propuesta');
  return result;
}

/** No hace nada: pasa el turno (para medir a la IA contra un rival quieto). */
export const passiveController = (): Controller => ({
  name: 'passive',
  playTurn: function* () {},
});

/**
 * Propone en cada turno las acciones que diga `actionsFor` para esa partida y ese equipo (las que no
 * valgan, la sesion las rechaza): para preparar una partida de prueba o de herramienta jugando.
 */
export const scriptedController = (actionsFor: (s: GameState, team: TeamId) => readonly GameAction[]): Controller => ({
  name: 'scripted',
  playTurn: function* (s, team) {
    for (const action of actionsFor(s, team)) yield* propose(action);
  },
});

/** Juega el turno con cada uno, en orden (p. ej. el piloto automatico de las ordenes y despues la IA). */
export const sequence = (...controllers: readonly Controller[]): Controller => ({
  name: 'sequence',
  playTurn: function* (s, team) {
    for (const controller of controllers) yield* controller.playTurn(s, team);
  },
});

/**
 * Decide alguien de fuera: la sesion espera (el equipo manda sus acciones con `GameSession.act`)
 * hasta que le dicen que ha terminado (`finishInput`); despues pasa el turno (sus ordenes
 * permanentes las cumple la partida al acabarlo, como las de cualquiera).
 */
function externalController(name: 'human' | 'remote'): Controller {
  return {
    name,
    playTurn: function* () {
      yield { kind: 'awaitInput' };
    },
  };
}

/** Una persona en esta pantalla. */
export const humanController = (): Controller => externalController('human');

/** Un jugador por la red: la sesion espera las acciones que lleguen. */
export const remoteController = (): Controller => externalController('remote');
