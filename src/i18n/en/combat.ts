import type { combat as es } from '../es/combat';
import type { Translation } from '../translation';

export const combat: Translation<typeof es> = {
  lessThan1: 'under 1%',
  moreThan99: 'over 99%',
  forecast: 'Combat forecast',
  enemyLife: 'Enemy HP',
  destroyIt: 'Destroy it',
  flank: 'Flanking',
  fxCaptured: 'CAPTURED!',
  yourLife: 'Your HP',
  dies: 'dies',
  fxNeutral: 'NEUTRAL',
};
