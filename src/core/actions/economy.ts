/** La accion de comprar: fabricar una unidad en un edificio propio. */
import { entryOf } from '../content';
import { findUnitType } from '../gameContent';
import { buildUnit, buyProblem } from '../rules/economy';
import { buildingAt } from '../rules/queries';
import { posOf } from '../geom';
import { checkedBuilding } from './checks';
import type { ActionRegistry } from '../model';

export const ECONOMY_ACTIONS: Pick<ActionRegistry, 'buy'> = {
  buy: {
    validate: (s, team, action) => {
      const building = buildingAt(s, action.at);
      const unitType = findUnitType(s, { type: action.unitType });
      if (!building || !unitType) return 'missing';
      return buyProblem(s, team, building, unitType);
    },
    apply: (s, team, action) => {
      const unit = buildUnit(s, team, checkedBuilding(s, action.at), entryOf(s.content.units, action.unitType, 'unidad'));
      return [{ kind: 'spawn', actor: team, uid: unit.uid, unitType: unit.type, team: unit.team, at: posOf(action.at) }];
    },
  },
};
