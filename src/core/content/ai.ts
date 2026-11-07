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

export function validateAi(ai: Record<string, unknown>, check: Checker): void {
  const s = check.scope('ai.json');
  for (const k of AI_KEYS) s.num(k, ai?.[k], { min: 0 });
  for (const k of Object.keys(ai ?? {}))
    if (k !== '$schema') s.expect((AI_KEYS as readonly string[]).includes(k), `peso desconocido "${k}"`);
}

export const buildAiWeights = (ai: Record<string, unknown>): AiWeights =>
  Object.fromEntries(AI_KEYS.map((k) => [k, ai[k] as number])) as AiWeights;
