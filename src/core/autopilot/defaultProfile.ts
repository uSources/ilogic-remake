/**
 * El perfil con el que la partida cumple las ordenes permanentes (de cualquier equipo): los pesos de
 * su contenido (ai.json) y las razones de siempre para valorar un ataque.
 */
import type { GameContent } from '../content';
import type { AutopilotProfile } from './profile';
import { ATTACK_SCORE_TERMS } from './scoring';

/** El perfil de autopilot/ con el contenido `content`. */
export const autopilotProfileOf = (content: GameContent): AutopilotProfile => ({ weights: content.ai, scoreTerms: ATTACK_SCORE_TERMS });
