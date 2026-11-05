/** Acciones de las escuadras: formarlas, grupos por tecla, salir, renombrar y deshacer. */
import {
  addToGroup,
  disbandSquad,
  formSquad,
  leaveSquad,
  pruneSquads,
  renameSquad,
  setGroup,
  squadRemovedEvent,
  type SomeUnits,
  type SquadChangeResult,
} from '../squads/membership';
import { cleanSquadName, SQUAD_KEYS } from '../squads/naming';
import { squadById, squadUnits } from '../squads/queries';
import type { ActionRejection, GameActionOf, GameEvent, GameState, Squad, SquadChange, TeamId, Unit } from '../model';
import { checkedUnits, ownUnitsProblem, someCheckedUnits } from './checks';
import type { ActionDefinition, ActionRegistry } from './types';

/** Una tecla de grupo (1-9). */
const isGroupKey = (key: number): boolean => key >= 1 && key <= SQUAD_KEYS;

/** Por que no vale una tecla de grupo (si la hay) para estas unidades del equipo. */
function groupProblem(
  s: GameState,
  team: TeamId,
  { uids, key }: { uids: readonly number[]; key: number | undefined },
): ActionRejection | null {
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

/** La escuadra `id` de una accion ya comprobada (si no esta, es un fallo del registro, como en checkedUnit). */
function checkedSquad(s: GameState, id: number): Squad {
  const squad = squadById(s, id);
  if (!squad) throw new Error(`La escuadra ${id} de una accion ya comprobada no existe`);
  return squad;
}

/** Las escuadras distintas de estas unidades, en el orden en que salen. */
function squadsOf(s: GameState, units: readonly Unit[]): Squad[] {
  const ids = [...new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])))];
  return ids.map((id) => squadById(s, id)).filter((squad): squad is Squad => !!squad);
}

/**
 * Los sucesos de formar o agrupar: primero las escuadras que se han quedado vacias y ya no existen
 * (su numero se puede volver a usar justo despues), luego la que queda.
 */
function squadChangeEvents(s: GameState, team: TeamId, result: SquadChangeResult, change: SquadChange): GameEvent[] {
  return [...result.removed.map((squad) => squadRemovedEvent(squad, team)), squadEvent(s, team, result.squad, change)];
}

type GroupActionKind = 'formSquad' | 'setGroup' | 'addToGroup';

/** Las unidades y la tecla de una accion de formar o agrupar (las tres las tienen). */
const uidsAndKey = (action: GameActionOf<GroupActionKind>): { uids: readonly number[]; key: number | undefined } => ({
  uids: action.uids,
  key: action.key,
});

/** Formar o agrupar con estas unidades del equipo (validate ya ha visto que son suyas y que hay alguna). */
type GroupChange<K extends GroupActionKind> = (s: GameState, team: TeamId, units: SomeUnits, action: GameActionOf<K>) => SquadChangeResult;

/** La entrada de formar o agrupar: la misma comprobacion y los mismos sucesos, con su cambio. */
function groupAction<K extends GroupActionKind>(change: SquadChange, run: GroupChange<K>): ActionDefinition<K> {
  return {
    validate: (s, team, action) => groupProblem(s, team, uidsAndKey(action)),
    apply: (s, team, action) => squadChangeEvents(s, team, run(s, team, someCheckedUnits(s, uidsAndKey(action).uids), action), change),
  };
}

export const SQUAD_ACTIONS: Pick<ActionRegistry, 'formSquad' | 'setGroup' | 'addToGroup' | 'leaveSquad' | 'renameSquad' | 'disbandSquad'> =
  {
    formSquad: groupAction<'formSquad'>('formed', (s, team, units, action) => formSquad(s, team, units, action.name, action.key)),
    setGroup: groupAction<'setGroup'>('grouped', (s, team, units, action) => setGroup(s, team, units, action.key)),
    addToGroup: groupAction<'addToGroup'>('grouped', (s, team, units, action) => addToGroup(s, team, units, action.key)),
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
        // Las que se quedan vacias ya no existen ('removed'); las demas, 'left' con las que les quedan.
        const removed = pruneSquads(s);
        const stillThere = left.filter((squad) => !removed.includes(squad));
        return [
          ...removed.map((squad) => squadRemovedEvent(squad, team)),
          ...stillThere.map((squad) => squadEvent(s, team, squad, 'left')),
        ];
      },
    },
    renameSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad) ?? (cleanSquadName(action.name) ? null : 'badName'),
      apply: (s, team, action) => {
        const squad = checkedSquad(s, action.squad);
        renameSquad(squad, action.name);
        return [squadEvent(s, team, squad, 'renamed')];
      },
    },
    disbandSquad: {
      validate: (s, team, action) => ownSquadProblem(s, team, action.squad),
      apply: (s, team, action) => {
        const squad = checkedSquad(s, action.squad);
        disbandSquad(s, squad);
        return [squadEvent(s, team, squad, 'disbanded')];
      },
    },
  };
