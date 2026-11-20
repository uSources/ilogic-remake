/**
 * Los perfiles de IA que se pueden enfrentar en `npm run balance` (`--vs <nombre>`): el del juego
 * ('ai') y los candidatos que se esten probando (docs/PLAN-IA.md). Un perfil nuevo es una entrada
 * mas: el mismo contenido de la partida, otro `AiProfile` (otros pesos, comportamientos o turno).
 */
import { classicAiProfile, defaultAiProfile, influenceAiProfile, styledAiProfile, type AiProfile } from '@core/ai';
import type { GameContent } from '@core/content';
import { defaultContent } from '@core/content/default';

/** Los pesos de antes de la fase 5 (`tune-ai` los cambio: balance/reports/ia-fase5.md). */
const BEFORE_TUNING = { minCapturers: 4, maxCaptureDistance: 8 };

/** El perfil con los pesos de antes de la fase 5. */
function untuned(profile: AiProfile): AiProfile {
  return { ...profile, weights: { ...profile.weights, ...BEFORE_TUNING } };
}

/** El perfil sin acordarse de los enemigos que ya no ve (como antes de la fase 3), con los pesos de entonces. */
function withoutMemory(profile: AiProfile): AiProfile {
  return untuned({ ...profile, weights: { ...profile.weights, memoryDays: 0 } });
}

export const AI_PROFILES: Readonly<Record<string, (content: GameContent) => AiProfile>> = {
  ai: defaultAiProfile,
  /** La del juego con los pesos de ai.json aunque la variante los cambie (contra ella prueba `tune-ai`). */
  actual: () => defaultAiProfile(defaultContent()),
  /** La de antes de la fase 1 del plan (sin mapas de influencia). */
  fase0: (content) => untuned(classicAiProfile(content)),
  /** La de la fase 1 del plan (mapas de influencia, sin planes que duran). */
  fase1: (content) => withoutMemory(influenceAiProfile(content)),
  /** La de la fase 2 del plan (planes que duran, sin memoria con la niebla). */
  fase2: (content) => withoutMemory(defaultAiProfile(content)),
  /** La de las fases 3 y 4 (memoria, personalidades), antes de ajustar sus pesos en la fase 5. */
  fase4: (content) => untuned(defaultAiProfile(content)),
  // La del juego con otra personalidad o dificultad (ai.json; docs/PLAN-IA.md, fase 4).
  agresiva: (content) => styledAiProfile(content, { personality: 'aggressive', difficulty: 'normal' }),
  cauta: (content) => styledAiProfile(content, { personality: 'cautious', difficulty: 'normal' }),
  codiciosa: (content) => styledAiProfile(content, { personality: 'greedy', difficulty: 'normal' }),
  tortuga: (content) => styledAiProfile(content, { personality: 'turtle', difficulty: 'normal' }),
  /** Fácil: con nervios (sin el dinero de mas o de menos de su dificultad, que es del equipo, no del perfil). */
  facil: (content) => styledAiProfile(content, { personality: 'balanced', difficulty: 'easy' }),
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
