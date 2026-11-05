/** La accion de capturar el edificio de debajo. */
import { advanceCapture, canCapture, captureEvent } from '../rules/capture';
import { keepCapturing } from '../squads/standingOrders';
import { actorProblem, checkedBuilding, checkedUnit } from './checks';
import type { ActionRegistry } from './types';

export const CAPTURE_ACTIONS: Pick<ActionRegistry, 'capture'> = {
  capture: {
    validate: (s, team, action) => actorProblem(s, team, action.uid, (unit) => (canCapture(s, unit) ? null : 'cannotCapture')),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const building = checkedBuilding(s, unit);
      const result = advanceCapture(s, unit, building);
      // [CAMBIO] Una captura empezada se termina: si llevaba otra orden, ahora es capturar este edificio.
      keepCapturing(s, unit);
      return [captureEvent(team, unit, building, result)];
    },
  },
};
