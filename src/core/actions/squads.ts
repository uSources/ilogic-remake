/** Acciones de las escuadras: formarlas, grupos por tecla, salir, renombrar y deshacer. */
import { addToGroup, disbandSquad, formSquad, leaveSquad, renameSquad, setGroup } from '../squads/membership';
import { cleanSquadName, SQUAD_KEYS } from '../squads/naming';
import { squadById, squadUnits } from '../squads/queries';
import type { ActionRejection, GameEvent, GameState, Squad, SquadChange, TeamId, Unit } from '../model';
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

/** Como queda una escuadra tras cambiarla (sus unidades ahora, nombre y tecla): su suceso. */
function squadEvent(s: GameState, team: TeamId, squad: Squad, change: SquadChange): GameEvent {
  const uids = squadUnits(s, squad.id).map((unit) => unit.uid);
  return {
    kind: 'squad',
    actor: team,
    squad: squad.id,
    change,
    uids,
    name: squad.name,
    ...(squad.key !== undefined ? { key: squad.key } : {}),
  };
}

/** Las escuadras distintas de estas unidades, en el orden en que salen. */
function squadsOf(s: GameState, units: readonly Unit[]): Squad[] {
  const ids = [...new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])))];
  return ids.map((id) => squadById(s, id)).filter((squad): squad is Squad => !!squad);
}

export const SQUAD_ACTIONS: Pick<ActionRegistry, 'formSquad' | 'setGroup' | 'addToGroup' | 'leaveSquad' | 'renameSquad' | 'disbandSquad'> =
  {
    formSquad: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        const squad = formSquad(s, team, checkedUnits(s, action.uids), action.name, action.key)!;
        return [squadEvent(s, team, squad, 'formed')];
      },
    },
    setGroup: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        const squad = setGroup(s, team, checkedUnits(s, action.uids), action.key)!;
        return [squadEvent(s, team, squad, 'grouped')];
      },
    },
    addToGroup: {
      validate: (s, team, action) => groupProblem(s, team, action.uids, action.key),
      apply: (s, team, action) => {
        const squad = addToGroup(s, team, checkedUnits(s, action.uids), action.key)!;
        return [squadEvent(s, team, squad, 'grouped')];
      },
    },
    leaveSquad: {
      validate: (s, team, action) => {
        const problem = ownUnitsProblem(s, team, action.uids);
        if (problem) return problem;
        return checkedUnits(s, action.uids).some((unit) => unit.squad !== undefined) ? null : 'notInSquad';
      },
      apply: (s, team, action) => {
        const units = checkedUnits(s, action.uids);
        const left = squadsOf(s, units);
        for (const unit of units) leaveSquad(s, unit);
        return left.map((squad) => squadEvent(s, team, squad, 'left'));
      },
    },
    renameSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad) ?? (cleanSquadName(action.name) ? null : 'badName'),
      apply: (s, team, action) => {
        renameSquad(s, action.squad, action.name);
        return [squadEvent(s, team, squadById(s, action.squad)!, 'renamed')];
      },
    },
    disbandSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad),
      apply: (s, team, action) => {
        const squad = squadById(s, action.squad)!;
        disbandSquad(s, action.squad);
        return [squadEvent(s, team, squad, 'disbanded')];
      },
    },
  };
