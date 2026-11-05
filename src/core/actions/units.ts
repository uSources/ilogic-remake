/** Lo demas que hace una unidad con su turno: esperar, reparar a las de al lado y retirarla del mapa. */
import { canSupply, repairNeighbours } from '../rules/supply';
import { removeUnit } from '../rules/lifecycle';
import { unitById } from '../rules/queries';
import { spendUnit } from '../rules/unitTurn';
import { actorProblem, checkedUnit, ownUnitOnMapProblem } from './checks';
import type { ActionRegistry } from './types';

export const UNIT_ACTIONS: Pick<ActionRegistry, 'wait' | 'supply' | 'deleteUnit'> = {
  wait: {
    validate: (s, team, action) => actorProblem(s, team, action.uid),
    apply: (s, _team, action) => {
      spendUnit(checkedUnit(s, action.uid));
      return [];
    },
  },
  supply: {
    validate: (s, team, action) => actorProblem(s, team, action.uid) ?? (canSupply(s, unitById(s, action.uid)!) ? null : 'nobodyToSupply'),
    apply: (s, _team, action) => {
      repairNeighbours(s, checkedUnit(s, action.uid));
      return [];
    },
  },
  deleteUnit: {
    // Se puede retirar una unidad propia del mapa aunque ya haya actuado (con lo que lleve dentro).
    validate: (s, team, action) => ownUnitOnMapProblem(s, team, action.uid),
    apply: (s, _team, action) => {
      removeUnit(s, action.uid);
      return [];
    },
  },
};
