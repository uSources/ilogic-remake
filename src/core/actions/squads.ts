/** Acciones de las escuadras: formarlas, grupos por tecla, salir, renombrar y deshacer. */
import { addToGroup, disbandSquad, formSquad, leaveSquad, renameSquad, setGroup } from '../squads/membership';
import { cleanSquadName, SQUAD_KEYS } from '../squads/naming';
import { squadById } from '../squads/queries';
import type { ActionRejection, GameState, TeamId } from '../model';
import { checkedUnits, ownUnitsProblem } from './checks';
import type { ActionRegistry } from './types';

/** Una tecla de grupo (1-9). */
const isGroupKey = (key: number): boolean => Number.isInteger(key) && key >= 1 && key <= SQUAD_KEYS;

/** Por que no vale una tecla de grupo (si la hay) para estas unidades del equipo. */
function groupProblem(s: GameState, team: TeamId, uids: readonly number[], key: number | undefined): ActionRejection | null {
  if (key !== undefined && !isGroupKey(key)) return 'badKey';
  return ownUnitsProblem(s, team, uids);
}

/** La escuadra `id` existe y es del equipo. */
function ownSquadProblem(s: GameState, team: TeamId, id: number): ActionRejection | null {
  const squad = squadById(s, id);
  if (!squad) return 'missing';
  return squad.team === team ? null : 'notYours';
}

export const SQUAD_ACTIONS: Pick<ActionRegistry, 'formSquad' | 'setGroup' | 'addToGroup' | 'leaveSquad' | 'renameSquad' | 'disbandSquad'> =
  {
    formSquad: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        formSquad(s, team, checkedUnits(s, action.uids), action.name, action.key);
        return [];
      },
    },
    setGroup: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        setGroup(s, team, checkedUnits(s, action.uids), action.key);
        return [];
      },
    },
    addToGroup: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        addToGroup(s, team, checkedUnits(s, action.uids), action.key);
        return [];
      },
    },
    leaveSquad: {
      validate: (s, team, action) => {
        const problem = ownUnitsProblem(s, team, action.uids);
        if (problem) return problem;
        return checkedUnits(s, action.uids).some((unit) => unit.squad !== undefined) ? null : 'notInSquad';
      },
      apply: (s, _team, action) => {
        for (const unit of checkedUnits(s, action.uids)) leaveSquad(s, unit);
        return [];
      },
    },
    renameSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad) ?? (cleanSquadName(action.name) ? null : 'badName'),
      apply: (s, _team, action) => {
        renameSquad(s, action.squad, action.name);
        return [];
      },
    },
    disbandSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad),
      apply: (s, _team, action) => {
        disbandSquad(s, action.squad);
        return [];
      },
    },
  };
