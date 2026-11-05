/** La accion de capturar el edificio de debajo. */
import { advanceCapture, canCapture, captureEvent } from '../rules/capture';
import { buildingAt, unitById } from '../rules/queries';
import { keepCapturing } from '../squads/standingOrders';
import { actorProblem, checkedUnit } from './checks';
import type { ActionRegistry } from './types';

export const CAPTURE_ACTIONS: Pick<ActionRegistry, 'capture'> = {
  capture: {
    validate: (s, team, action) => actorProblem(s, team, action.uid) ?? (canCapture(s, unitById(s, action.uid)!) ? null : 'cannotCapture'),
    apply: (s, _team, action) => {
      const unit = checkedUnit(s, action.uid);
      const building = buildingAt(s, unit)!;
      const result = advanceCapture(s, unit);
      // [CAMBIO] Una captura empezada se termina: si llevaba otra orden, ahora es capturar este edificio.
      keepCapturing(s, unit);
      return [captureEvent(unit, building, result)];
    },
  },
};
