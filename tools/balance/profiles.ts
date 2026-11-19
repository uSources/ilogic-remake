/**
 * Los perfiles de IA que se pueden enfrentar en `npm run balance` (`--vs <nombre>`): el del juego
 * ('ai') y los candidatos que se esten probando (docs/PLAN-IA.md). Un perfil nuevo es una entrada
 * mas: el mismo contenido de la partida, otro `AiProfile` (otros pesos, comportamientos o turno).
 */
import { classicAiProfile, defaultAiProfile, influenceAiProfile, type AiProfile } from '@core/ai';
import type { GameContent } from '@core/content';

/** El perfil sin acordarse de los enemigos que ya no ve (como antes de la fase 3). */
function withoutMemory(profile: AiProfile): AiProfile {
  return { ...profile, weights: { ...profile.weights, memoryDays: 0 } };
}

export const AI_PROFILES: Readonly<Record<string, (content: GameContent) => AiProfile>> = {
  ai: defaultAiProfile,
  /** La de antes de la fase 1 del plan (sin mapas de influencia). */
  fase0: classicAiProfile,
  /** La de la fase 1 del plan (mapas de influencia, sin planes que duran). */
  fase1: (content) => withoutMemory(influenceAiProfile(content)),
  /** La de la fase 2 del plan (planes que duran, sin memoria con la niebla). */
  fase2: (content) => withoutMemory(defaultAiProfile(content)),
};

/** Quien juega un equipo en las partidas de equilibrio: un perfil de AI_PROFILES o nadie ('passive', para medir a la IA). */
export type Policy = string;
export const PASSIVE: Policy = 'passive';

/** Falla si `policy` no es nadie ni un perfil conocido (para parar antes de jugar). */
export function checkPolicy(policy: Policy): void {
  if (policy !== PASSIVE && !Object.hasOwn(AI_PROFILES, policy))
    throw new Error(`Perfil de IA desconocido "${policy}" (validos: ${[PASSIVE, ...Object.keys(AI_PROFILES)].join(', ')})`);
}

/** El perfil que juega con ese nombre y ese contenido. */
export function profileOf(policy: Policy, content: GameContent): AiProfile {
  const profile = AI_PROFILES[policy];
  if (!profile) throw new Error(`Perfil de IA desconocido "${policy}"`);
  return profile(content);
}
