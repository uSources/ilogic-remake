import type { orders as es } from '../es/orders';
import type { Translation } from '../translation';

export const orders: Translation<typeof es> = {
  orderToAttack: 'Order: attack there',
  orderToCapture: 'Order: capture there',
  orderToDefend: 'Order: hold there',
  cancelOrder: 'Cancel order',
  orderAttack: 'Attack there',
  orderCapture: 'Capture there',
  orderDefend: 'Hold there',
  orderPick: 'Pick the order’s tile (Esc to cancel)',
  squads: 'Squads',
  squad: 'Squad',
  squadForm: 'Form squad',
  squadRename: 'Rename',
  /** En la rueda: elegir la escuadra de la unidad, y con el dedo, empezar a elegir varias. */
  squadSelect: 'Pick its squad',
  pickSeveral: 'Pick several',
  squadDisband: 'Disband squad',
  squadName: 'Squad name',
  pickedTitle: 'Selected',
  squadLeave: 'Leave the squad',
  detached: 'Detached',
  travelArrives: 'A unit with an order can reach it this turn: move it yourself, with its full movement',
  travelSet: 'Order given: it will advance on its own every turn (move it yourself to cancel)',
  travelUnreachable: 'It cannot get there',
};
