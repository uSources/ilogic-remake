/** Acciones de las ordenes permanentes: darlas, quitarlas y darlas por cumplidas. */
import { isOnBoard } from '../mapGrid';
import {
  cancelStandingOrder,
  effectiveStandingOrder,
  finishStandingOrder,
  giveStandingOrder,
  standingOrderBlock,
} from '../squads/standingOrders';
import { unitById } from '../rules/queries';
import { checkedUnit, checkedUnits, ownUnitProblem, ownUnitsProblem } from './checks';
import type { ActionRegistry } from './types';

export const STANDING_ORDER_ACTIONS: Pick<ActionRegistry, 'giveStandingOrder' | 'cancelStandingOrder' | 'finishStandingOrder'> = {
  giveStandingOrder: {
    validate: (s, team, action) => {
      if (!isOnBoard(s, action.order.at)) return 'offBoard';
      const problem = ownUnitsProblem(s, team, action.uids);
      if (problem) return problem;
      return standingOrderBlock(s, team, action.order.kind, action.order.at, checkedUnits(s, action.uids));
    },
    apply: (s, team, action) => {
      giveStandingOrder(s, team, checkedUnits(s, action.uids), action.order.kind, action.order.at);
      return [];
    },
  },
  cancelStandingOrder: {
    validate: (s, team, action) => ownUnitsProblem(s, team, action.uids),
    apply: (s, _team, action) => {
      cancelStandingOrder(s, checkedUnits(s, action.uids));
      return [];
    },
  },
  finishStandingOrder: {
    validate: (s, team, action) => {
      const problem = ownUnitProblem(s, team, action.uid);
      if (problem) return problem;
      return effectiveStandingOrder(s, unitById(s, action.uid)!) ? null : 'noStandingOrder';
    },
    apply: (s, _team, action) => {
      finishStandingOrder(s, checkedUnit(s, action.uid));
      return [];
    },
  },
};
