/** Acciones de transporte: unirse a otra unidad igual, subir a un transporte y bajar a un pasajero. */
import { posOf } from '../geom';
import { moveEvent, type MovePath } from '../rules/movement';
import { unitById } from '../rules/queries';
import { boardTransport, dropPassenger, loadProblem, mergeInto, mergeProblem, unloadProblem } from '../rules/transport';
import { canStillAct } from '../rules/unitTurn';
import type { ActionRejection, GameEvent, GameState, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit, ownUnitOnMapProblem } from './checks';
import type { ActionRegistry } from './types';

/** Por que no vale que `uid` vaya hasta la unidad `otherUid` (que tiene que existir) y entre en ella. */
function joinProblem(
  s: GameState,
  team: TeamId,
  uid: number,
  otherUid: number,
  problem: (unit: Unit, other: Unit) => ActionRejection | null,
): ActionRejection | null {
  const other = unitById(s, otherUid);
  if (!other) return 'missing';
  return actorProblem(s, team, uid) ?? problem(unitById(s, uid)!, other);
}

/** El suceso de ir hasta otra unidad y entrar en ella; con una emboscada por el camino, solo el de mover. */
function joinEvent(actor: TeamId, kind: 'merge' | 'load', uid: number, into: number, path: MovePath): GameEvent {
  return path.ambush ? moveEvent(actor, uid, path) : { kind, actor, uid, into, path };
}

export const TRANSPORT_ACTIONS: Pick<ActionRegistry, 'merge' | 'load' | 'unload'> = {
  merge: {
    validate: (s, team, action) => joinProblem(s, team, action.uid, action.into, (unit, target) => mergeProblem(s, unit, target)),
    apply: (s, team, action) => {
      const path = mergeInto(s, checkedUnit(s, action.uid), checkedUnit(s, action.into));
      return [joinEvent(team, 'merge', action.uid, action.into, path)];
    },
  },
  load: {
    validate: (s, team, action) => joinProblem(s, team, action.uid, action.into, (unit, transport) => loadProblem(s, unit, transport)),
    apply: (s, team, action) => {
      const path = boardTransport(s, checkedUnit(s, action.uid), checkedUnit(s, action.into));
      return [joinEvent(team, 'load', action.uid, action.into, path)];
    },
  },
  unload: {
    validate: (s, team, action) => {
      const problem = ownUnitOnMapProblem(s, team, action.uid);
      if (problem) return problem;
      const transport = unitById(s, action.uid)!;
      const passenger = unitById(s, action.passenger);
      if (!passenger) return 'missing';
      if (!canStillAct(transport)) return 'spent';
      return unloadProblem(s, transport, passenger, action.to);
    },
    apply: (s, team, action) => {
      dropPassenger(checkedUnit(s, action.uid), checkedUnit(s, action.passenger), action.to);
      return [{ kind: 'unload', actor: team, uid: action.uid, passenger: action.passenger, to: posOf(action.to) }];
    },
  },
};
