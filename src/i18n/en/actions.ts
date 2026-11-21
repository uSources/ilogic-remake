import type { actions as es } from '../es/actions';
import type { Translation } from '../translation';

export const actions: Translation<typeof es> = {
  attack: 'Attack',
  capture: 'Capture',
  unload: 'Unload',
  supply: 'Repair',
  wait: 'Wait',
  back: 'Back',
  undo: 'Undo',
  unloadPick: 'Pick where to drop {name}',
  delete: 'Disband',
  cancel: 'Cancel',
  buy: 'Buy',
  cantAfford: 'Not enough funds',
  unitLimit: '{n} unit limit reached',
  commandLimit: 'Not enough command points (max {n})',
  commandShort: 'command',
  goThere: 'Go there (several turns)',
  onFoot: 'foot',
  byVehicle: 'veh.',
  stepCostTitle: 'Cost to enter: on foot and by vehicle',
};
