/**
 * Quien decide lo que hace un equipo en su turno: un `Controller`. La sesion (gameSession.ts) le
 * pide su turno (`playTurn`) cuando le toca y va haciendo lo que da, paso a paso (`TurnStep`):
 * - 'propose': una accion que propone (la sesion la manda con `dispatch` y le devuelve el resultado);
 * - 'awaitInput': espera a quien decide fuera (una persona en la pantalla, un jugador en la red):
 *   la sesion se para hasta que le digan que ha terminado (`GameSession.finishInput`).
 * Ningun controlador manda nada: todo lo que hace un equipo pasa por la sesion (la IA y las ordenes
 * son planes que proponen, `ActionPlan`: `proposing`). Cuando su turno acaba (el generador termina),
 * la sesion manda 'endTurn'. Un controlador nuevo (un cliente remoto, una repeticion) es una funcion
 * que da un `Controller`: la sesion y las reglas no cambian.
 */
import type { ActionPlan, ActionResult, GameAction, GameState, TeamId } from '../model';
import type { PlayerView } from '../playerView';

/** Un paso del turno de un controlador. */
export type TurnStep = { kind: 'propose'; action: GameAction } | { kind: 'awaitInput' };

/** El turno de un equipo, paso a paso: recibe el resultado de cada accion que propone. */
export type TurnPlan = Generator<TurnStep, void, ActionResult | undefined>;

/** Que tipo de controlador es (para enseñarlo y depurar). */
export type ControllerName = 'human' | 'ai' | 'autopilot' | 'remote' | 'replay' | 'random' | 'passive' | 'sequence' | 'scripted';

export interface Controller {
  readonly name: ControllerName;
  /**
   * Lo decide una persona en esta pantalla (la sesion la espera; la escena mira desde ella, guarda al
   * empezar su turno). Es la unica forma de preguntarlo: `GameSession.isPerson`.
   */
  readonly person?: true;
  /**
   * El turno de su equipo, paso a paso, con lo que sabe de la partida (`view`: la de su equipo, que
   * le da la sesion; nunca la partida de verdad).
   */
  playTurn(view: PlayerView): TurnPlan;
}

/** Propone una accion y da su resultado (lo que ha dicho la sesion al mandarla). */
export function* propose(action: GameAction): Generator<TurnStep, ActionResult, ActionResult | undefined> {
  const result = yield { kind: 'propose', action };
  if (!result) throw new Error('La sesion no ha devuelto el resultado de una accion propuesta');
  return result;
}

/** El plan de quien decide (la IA, las ordenes) como pasos de un controlador: cada accion que propone, con su resultado. */
export function* proposing<Result>(plan: ActionPlan<Result>): Generator<TurnStep, Result, ActionResult | undefined> {
  for (let step = plan.next(); ;) {
    if (step.done) return step.value;
    step = plan.next(yield* propose(step.value));
  }
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
  playTurn: function* (view) {
    for (const action of actionsFor(view.state, view.team)) yield* propose(action);
  },
});

/** Juega el turno con cada uno, en orden (p. ej. el piloto automatico de las ordenes y despues la IA). */
export const sequence = (...controllers: readonly Controller[]): Controller => ({
  name: 'sequence',
  // Si en la serie decide una persona, el equipo es de una persona.
  ...(controllers.some((controller) => controller.person) ? { person: true as const } : {}),
  playTurn: function* (view) {
    for (const controller of controllers) yield* controller.playTurn(view);
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
    ...(name === 'human' ? { person: true as const } : {}),
    playTurn: function* () {
      yield { kind: 'awaitInput' };
    },
  };
}

/** Una persona en esta pantalla. */
export const humanController = (): Controller => externalController('human');

/** Un jugador por la red: la sesion espera las acciones que lleguen. */
export const remoteController = (): Controller => externalController('remote');
