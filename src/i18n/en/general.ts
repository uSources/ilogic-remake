import type { general as es } from '../es/general';
import type { Translation } from '../translation';

export const general: Translation<typeof es> = {
  labTitle: 'Animation lab',
  labSlow: 'Slow motion',
  labMove: 'Move',
  labAttack: 'Attack',
  labCounter: 'Counterattack',
  labKill: 'Destroy',
  general: 'General',
  noGeneral: 'No general',
  genUsed: 'Already used this turn',
  genCharge: 'Not enough charge',
  genChargeHint: 'Charges with the damage you deal and take',
  genTarget: 'Choose where: Enter or click · Esc: cancel',
  genCancel: 'Cancel',
};
