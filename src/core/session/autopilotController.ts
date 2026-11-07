/**
 * Cumple ya, en su turno, las ordenes permanentes del equipo (`assistTurn`): las unidades con orden
 * que siguen sin usar. Al acabar el turno las cumpliria igual la partida (TURN_END_PHASES); esto es
 * para quien quiere verlas antes de hacer lo demas (la huella, en serie con la IA). No es la IA:
 * propone las acciones del plan de las ordenes, como cualquier controlador.
 */
import { assistTurn } from '../autopilot/standingOrders';
import { proposing, type Controller } from './controller';

export const autopilotController = (): Controller => ({
  name: 'autopilot',
  playTurn: function* (s, team) {
    yield* proposing(assistTurn(s, team));
  },
});
