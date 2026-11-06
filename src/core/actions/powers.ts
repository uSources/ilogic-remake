/** La accion de usar un poder del general del equipo. */
import { applyPower, powerBlock } from '../generals';
import { isOnBoard } from '../mapGrid';
import type { ActionRegistry } from './types';

export const POWER_ACTIONS: Pick<ActionRegistry, 'usePower'> = {
  usePower: {
    validate: (s, team, action) => {
      if (action.target && !isOnBoard(s, action.target)) return 'offBoard';
      return powerBlock(s, team, action.power, action.target);
    },
    apply: (s, team, action) => [applyPower(s, team, action.power, action.target)],
  },
};
