import { rulesWith } from '@core/rulesConfig';
import type { RulesConfig } from '@core/model';
import { defaultContent } from '@core/content/default';

/** Reglas "basicas" para tests: los interruptores de reglas apagados (como variante de equilibrio). */
export const PLAIN_RULES: RulesConfig = rulesWith(defaultContent(), {
  counterattack: false,
  damageSpread: null,
  hqCapturePoints: 20,
  veterancy: false,
  bounty: 0,
  flankBonus: 0,
  noHealUnderFire: false,
  passAllies: false,
  ambush: false,
  forestHides: false,
  terrainCost: false,
  abilities: false,
  commandPoints: null,
  upkeep: 0,
  weather: false,
  controlPoints: 0,
});
