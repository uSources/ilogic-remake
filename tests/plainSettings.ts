import { settingsWith } from '@core/matchSettings';
import type { MatchSettings } from '@core/model';
import { defaultContent } from '@core/content/default';

/** Reglas "basicas" para tests: los interruptores de reglas apagados (como variante de equilibrio). */
export const PLAIN_SETTINGS: MatchSettings = settingsWith(defaultContent(), {
  counterattack: false,
  damageModel: 'shotByShot',
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
