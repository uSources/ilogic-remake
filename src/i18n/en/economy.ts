import type { economy as es } from '../es/economy';
import type { Translation } from '../translation';

export const economy: Translation<typeof es> = {
  perDay: 'per day',
  buildingsN: 'buildings',
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
  reportIncome: 'income',
  reportUpkeep: 'upkeep',
  reportControl: 'from control points',
  reportContested: 'Contested control points (no pay)',
  reportHealed: 'units repaired',
  reportHealed1: 'unit repaired',
};
