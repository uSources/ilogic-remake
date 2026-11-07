/**
 * Como juega una IA (`AiProfile`): los pesos y las razones de autopilot/ (`AutopilotProfile`) y lo que
 * prueba con cada unidad, en orden (`behaviours`). Se le da a su controlador (`aiController`): dos IAs
 * con otros perfiles juegan a la vez sin cambiar nada global (la arena compara asi la IA de ahora
 * con la de referencia).
 */
import type { GameContent } from '../content';
import { autopilotProfileOf } from '../autopilot/defaultProfile';
import type { AutopilotProfile } from '../autopilot/profile';
import { UNIT_BEHAVIOURS, type UnitBehaviour } from './unitTurn';

export interface AiProfile extends AutopilotProfile {
  /** Lo que prueba con cada unidad, de mas a menos urgente: se queda con el primero que la usa. */
  readonly behaviours: readonly UnitBehaviour[];
}

/** La IA del juego con el contenido `content`: sus pesos (ai.json), las razones de siempre y `UNIT_BEHAVIOURS`. */
export const defaultAiProfile = (content: GameContent): AiProfile => ({ ...autopilotProfileOf(content), behaviours: UNIT_BEHAVIOURS });
