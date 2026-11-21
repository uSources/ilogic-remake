/**
 * La IA del juego (`defaultAiProfile`) y las de antes, para compararlas (`npm run balance -- run --vs`).
 */
import type { GameContent } from '../content';
import { autopilotProfileOf } from '../autopilot/defaultProfile';
import type { AiProfile } from './profile';
import { aiTurn } from './turn';
import { INFLUENCE_BEHAVIOURS, UNIT_BEHAVIOURS } from './unitTurn';
import { EXPOSURE_TERM, PLACE_TERMS } from './placeTerms';

/** La IA de antes de los mapas de influencia: sus pesos (ai.json), las razones de siempre, `UNIT_BEHAVIOURS` y `aiTurn`. */
export const classicAiProfile = (content: GameContent): AiProfile => ({
  ...autopilotProfileOf(content),
  behaviours: UNIT_BEHAVIOURS,
  turn: aiTurn,
});

/**
 * La IA del juego con el contenido `content`: la de siempre con mapas de influencia (docs/PLAN-IA.md,
 * fase 1). Elige casilla mirando el peligro y la compañia, resta al valor de un ataque lo expuesta que
 * se queda, se pone a cubierto si la pueden destruir y, sin nada que hacer, va al frente.
 */
export const defaultAiProfile = (content: GameContent): AiProfile => {
  const classic = classicAiProfile(content);
  return { ...classic, scoreTerms: [...classic.scoreTerms, EXPOSURE_TERM], placeTerms: PLACE_TERMS, behaviours: INFLUENCE_BEHAVIOURS };
};
