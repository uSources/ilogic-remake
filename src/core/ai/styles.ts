/**
 * La IA de cada equipo, con su personalidad y su dificultad (docs/PLAN-IA.md, fase 4): la del juego
 * (`defaultAiProfile`) con los pesos que cambian las dos (ai.json, "personalities" y "difficulties").
 * Un id que el contenido no tiene (una partida guardada con otro contenido) juega con la de siempre.
 */
import { findEntry } from '../content/catalog';
import { teamState } from '../teams';
import type { GameContent } from '../content';
import type { GameState, TeamId } from '../model';
import { defaultAiProfile } from './defaultProfile';
import type { AiProfile } from './profile';

/** La forma de jugar de una IA: su personalidad y su dificultad, por su id. */
export interface AiStyleChoice {
  personality: string;
  difficulty: string;
}

/** La IA del juego con esa personalidad y esa dificultad (la dificultad manda si las dos cambian un peso). */
export function styledAiProfile(content: GameContent, choice: AiStyleChoice): AiProfile {
  const base = defaultAiProfile(content);
  const personality = findEntry(content.personalities, choice.personality) ?? content.defaultPersonality;
  const difficulty = findEntry(content.difficulties, choice.difficulty) ?? content.defaultDifficulty;
  return { ...base, weights: { ...base.weights, ...personality.weights, ...difficulty.weights } };
}

/** La IA con la que juega el equipo `team` de la partida: la suya (`TeamState.personality` y `difficulty`). */
export const aiProfileFor = (s: GameState, team: TeamId): AiProfile => styledAiProfile(s.content, teamState(s, team));
