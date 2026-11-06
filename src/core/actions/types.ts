/**
 * La forma de una accion en el registro (ACTIONS, actions/registry.ts): cuando vale y que hace.
 */
import type { ActionRejection, ActionResult, Dice, GameAction, GameActionKind, GameActionOf, GameEvent, GameState, TeamId } from '../model';

export interface ActionDefinition<K extends GameActionKind> {
  /**
   * Por que no vale ahora (null = vale) para el equipo `team`. Lo comprueba todo desde la partida
   * (alcance, vision, dinero...): no se fia de nada que traiga la accion ni de quien la manda.
   */
  validate(s: GameState, team: TeamId, action: GameActionOf<K>): ActionRejection | null;
  /** La hace (ya comprobada) y devuelve sus sucesos, en orden. El azar, de `dice`. */
  apply(s: GameState, team: TeamId, action: GameActionOf<K>, dice: Dice): GameEvent[];
  /**
   * Deja como estan los movimientos que se pueden deshacer (`GameState.undoableMoves`): las acciones
   * que no cuentan nada nuevo de la partida (mover, esperar, escuadras, ordenes). Tras cualquier otra
   * se olvidan (dispatch): deshacer no sirve para mirar con una unidad, atacar con otra y volver.
   */
  readonly keepsUndo?: true;
  /**
   * Vale tambien fuera del turno del equipo (sin las comprobaciones de turno de ACTION_GUARDS):
   * rendirse, que en una partida por la red o con varias personas se puede pedir en cualquier momento.
   */
  readonly anyTime?: true;
}

/** Las acciones que hacen otras acciones del equipo: empezar y acabar el turno (sus pasos). */
export type CompositeActionKind = 'startTurn' | 'endTurn';

/**
 * Una accion que hace otras del equipo (los pasos de turno): las manda por `perform`, con las mismas
 * comprobaciones que dispatch, y sus sucesos van entre los suyos. Solo estas lo reciben.
 */
export interface CompositeActionDefinition<K extends CompositeActionKind> extends Omit<ActionDefinition<K>, 'apply'> {
  apply(s: GameState, team: TeamId, action: GameActionOf<K>, dice: Dice, perform: ActionDispatcher): GameEvent[];
}

/** Una entrada por tipo de accion (el tipo obliga a tenerlas todas). */
export type ActionRegistry = {
  readonly [K in GameActionKind]: K extends CompositeActionKind ? CompositeActionDefinition<K> : ActionDefinition<K>;
};

/**
 * Por donde manda sus acciones quien juega un equipo: `dispatch`, o algo que la llama y ademas lo
 * apunta (la sesion: registro de acciones, avisos). La IA y las ordenes lo reciben (autopilot/context.ts, `PlayCtx.dispatch`).
 */
export type ActionDispatcher = (s: GameState, team: TeamId, action: GameAction) => ActionResult;
