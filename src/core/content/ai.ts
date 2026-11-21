/** Pesos de la IA (ai.json): lo que lee src/core/ai.ts. */
import { type Checker } from './check';

/** Pesos que lee la IA; ai.json tiene que tener exactamente estos. */
export const AI_KEYS = [
  'maxMergedLife',
  'maxCaptureDistance',
  'retreatBelowLife',
  'costPerPoint',
  'killBonus',
  'hqDefenderBonus',
  'stopHqCaptureBonus',
  'stopCaptureBonus',
  'fullBonusDamage',
  'enemyHqPreference',
  'ownedBuildingPreference',
  'minCapturers',
  'guardRadius',
  'controlPointHeadStart',
  'focusFireBonus',
  'squadSpread',
  'hqCaptureHeadStart',
  'bigUnitCost',
  'minEvictionWeight',
  'dangerAversion',
  'supportedDangerShare',
  'lonelinessCost',
  'companyRadius',
  'exposureShare',
  'coverDangerShare',
  'pushAdvantage',
  'attackNeedRatio',
  'crowdSteps',
  'memoryDays',
  'nerves',
  'reserveShare',
] as const;
export type AiWeights = Record<(typeof AI_KEYS)[number], number>;

/** Lo que hay en ai.json ademas de los pesos: su esquema, las personalidades y las dificultades (aiStyles.ts). */
const NOT_WEIGHTS: readonly string[] = ['$schema', 'personalities', 'difficulties'];

/** Cada peso es un numero no negativo y no hay ninguno que la IA no lea (las personalidades y dificultades, en aiStyles.ts). */
export function validateAi(ai: Record<string, unknown>, check: Checker): void {
  const scope = check.scope('ai.json');
  for (const weight of AI_KEYS) scope.num(weight, ai?.[weight], { min: 0 });
  for (const field of Object.keys(ai ?? {}))
    if (!NOT_WEIGHTS.includes(field)) scope.expect((AI_KEYS as readonly string[]).includes(field), `peso desconocido "${field}"`);
}

/** Los pesos ya comprobados (validateAi), por su nombre. */
export const buildAiWeights = (ai: Record<string, unknown>): AiWeights =>
  Object.fromEntries(AI_KEYS.map((weight) => [weight, ai[weight] as number])) as AiWeights;
