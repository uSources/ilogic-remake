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
  'minPowerValue',
  'revealValue',
  'guardRadius',
  'controlPointHeadStart',
  'focusFireBonus',
  'squadSpread',
  'hqCaptureHeadStart',
  'bigUnitCost',
  'minEvictionWeight',
] as const;
export type AiWeights = Record<(typeof AI_KEYS)[number], number>;

/** Cada peso es un numero no negativo y no hay ninguno que la IA no lea. */
export function validateAi(ai: Record<string, unknown>, check: Checker): void {
  const scope = check.scope('ai.json');
  for (const weight of AI_KEYS) scope.num(weight, ai?.[weight], { min: 0 });
  for (const field of Object.keys(ai ?? {}))
    if (field !== '$schema') scope.expect((AI_KEYS as readonly string[]).includes(field), `peso desconocido "${field}"`);
}

/** Los pesos ya comprobados (validateAi), por su nombre. */
export const buildAiWeights = (ai: Record<string, unknown>): AiWeights =>
  Object.fromEntries(AI_KEYS.map((weight) => [weight, ai[weight] as number])) as AiWeights;
