import type { economy as es } from '../es/economy';
import type { Translation } from '../translation';

export const economy: Translation<typeof es> = {
  ecoIncome: 'Income per day',
  ecoNoBuildings: 'No buildings',
  ecoScale: 'Income rule',
  ecoUpkeep: 'Upkeep',
  ecoUpkeepNote: "of your army's price, rounded to 100",
  ecoNoUnits: 'No units',
  ecoNet: 'Net per day',
  ecoNext: 'At the start of your next turn',
  ecoShortfall: 'Not enough for all of it: only paying',
  ecoCommand: 'Command points',
  ecoFree: 'free',
  buyFunds: 'You have',
  buyLeft: "You'll have {n} left",
  buyShort: 'You need {n} more',
  buyMissing: '{n} short',
  buyEmpties: 'leaves you at 0',
  buyStrong: 'Strong against {list}',
  buyWeak: 'Weak against {list}',
  buyHint: '↑ ↓ to choose · Enter to buy · Esc to leave without buying',
};
