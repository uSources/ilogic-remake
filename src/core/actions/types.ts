/**
 * La forma de una accion en el registro (ACTIONS, actions/registry.ts): cuando vale y que hace.
 */
import type { ActionRejection, Dice, GameActionKind, GameActionOf, GameEvent, GameState, TeamId } from '../model';

export interface ActionDefinition<K extends GameActionKind> {
  /**
   * Por que no vale ahora (null = vale) para el equipo `team`. Lo comprueba todo desde la partida
   * (alcance, vision, dinero...): no se fia de nada que traiga la accion ni de quien la manda.
   */
  validate(s: GameState, team: TeamId, action: GameActionOf<K>): ActionRejection | null;
  /** La hace (ya comprobada) y devuelve sus sucesos, en orden. El azar, de `dice`. */
  apply(s: GameState, team: TeamId, action: GameActionOf<K>, dice: Dice): GameEvent[];
  /**
   * Deja abierta la ventana para deshacer (`GameState.lastMove`): solo la accion que la abre (mover).
   * Cualquier otra la cierra al acabar (dispatch): deshacer no sirve para mirar con una unidad y
   * volver despues de haber hecho otra cosa.
   */
  readonly keepsUndoWindow?: true;
}

/** Una entrada por tipo de accion (el tipo obliga a tenerlas todas). */
export type ActionRegistry = { readonly [K in GameActionKind]: ActionDefinition<K> };
