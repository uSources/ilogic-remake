/** Lo demas que hace una unidad con su turno: esperar, reparar a las de al lado y retirarla del mapa. */
import { canSupply, repairNeighbours } from '../rules/supply';
import { removeWithCargo } from '../rules/lifecycle';
import { spendUnit } from '../rules/unitTurn';
import { actorProblem, checkedUnit, ownUnitOnMapProblem } from './checks';
import type { ActionRegistry } from './types';

export const UNIT_ACTIONS: Pick<ActionRegistry, 'wait' | 'supply' | 'deleteUnit'> = {
  wait: {
    validate: (s, team, action) => actorProblem(s, team, action.uid),
    apply: (s, team, action) => {
      spendUnit(checkedUnit(s, action.uid));
      return [{ kind: 'wait', actor: team, uid: action.uid }];
    },
  },
  supply: {
    validate: (s, team, action) => actorProblem(s, team, action.uid, (unit) => (canSupply(s, unit) ? null : 'nobodyToSupply')),
    apply: (s, team, action) => {
      const repairs = repairNeighbours(s, checkedUnit(s, action.uid));
      return [{ kind: 'supply', actor: team, uid: action.uid, repairs }];
    },
  },
  deleteUnit: {
    // Se puede retirar una unidad propia del mapa aunque ya haya actuado (con lo que lleve dentro).
    validate: (s, team, action) => ownUnitOnMapProblem(s, team, action.uid),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const removed = { kind: 'remove', actor: team, uid: unit.uid, unitType: unit.type } as const;
      return [removed, ...removeWithCargo(s, unit)];
    },
  },
};
