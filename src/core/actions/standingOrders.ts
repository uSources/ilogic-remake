/** Acciones de las ordenes permanentes: darlas, quitarlas y darlas por cumplidas. */
import { posOf } from '../geom';
import { isOnBoard } from '../mapGrid';
import { effectiveStandingOrder, standingOrderBlock } from '../squads/standingOrderQueries';
import { cancelStandingOrder, finishStandingOrder, giveStandingOrder } from '../squads/standingOrderSteps';
import { checkedUnit, checkedUnits, ownUnitProblem, ownUnitsProblem } from './checks';
import type { ActionRegistry } from '../model';

export const STANDING_ORDER_ACTIONS: Pick<ActionRegistry, 'giveStandingOrder' | 'cancelStandingOrder' | 'finishStandingOrder'> = {
  giveStandingOrder: {
    keepsUndo: true,
    validate: (s, team, action) => {
      if (!isOnBoard(s, action.order.at)) return 'offBoard';
      const problem = ownUnitsProblem(s, team, action.uids);
      if (problem) return problem;
      return standingOrderBlock(s, team, action.order.kind, action.order.at, checkedUnits(s, action.uids));
    },
    apply: (s, team, action) => {
      const units = checkedUnits(s, action.uids);
      // La orden nueva manda sobre la que llevaran (tambien la de ir alli): es lo ultimo que se les ha dicho.
      giveStandingOrder(s, team, units, action.order.kind, action.order.at);
      const order = { kind: action.order.kind, at: posOf(action.order.at) };
      return [{ kind: 'standingOrder', actor: team, uids: [...action.uids], order }];
    },
  },
  cancelStandingOrder: {
    keepsUndo: true,
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
      return [{ kind: 'standingOrderDone', actor: team, uid: action.uid, end: 'fulfilled' }];
    },
  },
};
