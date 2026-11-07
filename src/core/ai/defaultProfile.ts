/** La IA del juego (`defaultAiProfile`): su perfil con el contenido de la partida. */
import type { GameContent } from '../content';
import { autopilotProfileOf } from '../autopilot/defaultProfile';
import type { AiProfile } from './profile';
import { aiTurn } from './turn';
import { UNIT_BEHAVIOURS } from './unitTurn';

/** La IA del juego con el contenido `content`: sus pesos (ai.json), las razones de siempre, `UNIT_BEHAVIOURS` y `aiTurn`. */
export const defaultAiProfile = (content: GameContent): AiProfile => ({
  ...autopilotProfileOf(content),
  behaviours: UNIT_BEHAVIOURS,
  turn: aiTurn,
});
