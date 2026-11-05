/** Acciones de las ordenes permanentes: darlas, quitarlas y darlas por cumplidas. */
import { posOf } from '../geom';
import { isOnBoard } from '../mapGrid';
import {
  cancelStandingOrder,
  effectiveStandingOrder,
  finishStandingOrder,
  giveStandingOrder,
  standingOrderBlock,
} from '../squads/standingOrders';
import { endTravel } from '../rules/travel';
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
      const units = checkedUnits(s, action.uids);
      // Una orden manda sobre el viaje que llevaran: es lo ultimo que se le ha dicho.
      const travelsEnded = units.flatMap((unit) => endTravel(team, unit, 'ordered'));
      giveStandingOrder(s, team, units, action.order.kind, action.order.at);
      const order = { kind: action.order.kind, at: posOf(action.order.at) };
      return [...travelsEnded, { kind: 'standingOrder', actor: team, uids: [...action.uids], order }];
    },
  },
  cancelStandingOrder: {
    validate: (s, team, action) => {
      const problem = ownUnitsProblem(s, team, action.uids);
      if (problem) return problem;
      const hasOrder = checkedUnits(s, action.uids).some((unit) => effectiveStandingOrder(s, unit));
      return hasOrder ? null : 'noStandingOrder';
    },
    apply: (s, team, action) => {
      cancelStandingOrder(s, checkedUnits(s, action.uids));
      return [{ kind: 'standingOrder', actor: team, uids: [...action.uids], order: null }];
    },
  },
  finishStandingOrder: {
    validate: (s, team, action) =>
      ownUnitProblem(s, team, action.uid, (unit) => (effectiveStandingOrder(s, unit) ? null : 'noStandingOrder')),
    apply: (s, team, action) => {
      finishStandingOrder(s, checkedUnit(s, action.uid));
      return [{ kind: 'standingOrderDone', actor: team, uid: action.uid }];
    },
  },
};
