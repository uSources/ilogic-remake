/**
 * Como juega una IA (`AiProfile`): los pesos y las razones de autopilot/ (`AutopilotProfile`), lo que
 * prueba con cada unidad, en orden (`behaviours`), y su turno entero (`turn`). Se le da a su
 * controlador (`aiController`): dos IAs con otros perfiles juegan a la vez sin cambiar nada global
 * (`npm run balance -- run --vs <perfil>` compara asi pesos, comportamientos o codigo). La del juego, `defaultAiProfile`
 * (defaultProfile.ts).
 */
import type { AutopilotProfile } from '../autopilot/profile';
import type { ActionPlan, GameState, Rng } from '../model';
import type { PlayCtx } from '../autopilot/context';
import type { PlayerView } from '../playerView';
import type { UnitBehaviour } from './unitTurn';

/** El turno de una IA: con lo que sabe su equipo, su perfil y su azar, las acciones que propone. */
export type AiTurn = (view: PlayerView, profile: AiProfile, rng: Rng) => ActionPlan;

export interface AiProfile extends AutopilotProfile {
  /** Lo que prueba con cada unidad, de mas a menos urgente: se queda con el primero que la usa. */
  readonly behaviours: readonly UnitBehaviour[];
  /** Su turno entero (el del juego: `aiTurn`, que usa lo de arriba). */
  readonly turn: AiTurn;
  /**
   * Lo que hace al empezar su turno, antes de mover ninguna unidad, con su contexto (los planes que
   * duran: `updatePlans`, plans.ts). Sin el, nada.
   */
  readonly planner?: (s: GameState, play: PlayCtx) => ActionPlan;
}
