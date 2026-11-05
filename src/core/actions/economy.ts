/** La accion de comprar: fabricar una unidad en un edificio propio. */
import { findUnitType } from '../gameContent';
import { buildUnit, buyProblem } from '../rules/economy';
import { buildingAt } from '../rules/queries';
import { posOf } from '../geom';
import type { ActionRegistry } from './types';

export const ECONOMY_ACTIONS: Pick<ActionRegistry, 'buy'> = {
  buy: {
    validate: (s, team, action) => {
      const building = buildingAt(s, action.at);
      const unitType = findUnitType(s, { type: action.unitType });
      if (!building || !unitType) return 'missing';
      return buyProblem(s, team, building, unitType);
    },
    apply: (s, _team, action) => {
      const unit = buildUnit(s, buildingAt(s, action.at)!, findUnitType(s, { type: action.unitType })!);
      return [{ kind: 'spawn', uid: unit.uid, at: posOf(action.at) }];
    },
  },
};
