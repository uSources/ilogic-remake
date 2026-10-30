import { DEFAULT_RULES, type RulesConfig } from '@core/data';

/** Reglas "basicas" para tests: los interruptores de reglas apagados (como variante de equilibrio). */
export const PLAIN_RULES: RulesConfig = {
  ...DEFAULT_RULES,
  counterattack: false,
  damageSpread: null,
  hqCapturePoints: 20,
  veterancy: false,
  passAllies: false,
  ambush: false,
  forestHides: false,
  terrainCost: false,
  abilities: false,
  commandPoints: null,
  upkeep: 0,
};
