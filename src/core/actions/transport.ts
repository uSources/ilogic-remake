/** Acciones de transporte: unirse a otra unidad igual, subir a un transporte y bajar a un pasajero. */
import { posOf } from '../geom';
import { moveEvent, type MovePath } from '../rules/movement';
import { unitById } from '../rules/queries';
import { endTravel } from '../rules/travel';
import { boardTransport, dropPassenger, loadProblem, mergeInto, mergeProblem, unloadProblem } from '../rules/transport';
import type { ActionRejection, GameEvent, GameState, TeamId, Unit } from '../model';
import { actorProblem, checkedUnit } from './checks';
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
  return actorProblem(s, team, uid, (unit) => problem(unit, other));
}

/** El suceso de ir hasta otra unidad y entrar en ella; con una emboscada por el camino, solo el de mover. */
function joinEvent(actor: TeamId, kind: 'merge' | 'load', uid: number, into: number, path: MovePath): GameEvent {
  return path.ambush ? moveEvent(actor, uid, path) : { kind, actor, uid, into, path };
}

export const TRANSPORT_ACTIONS: Pick<ActionRegistry, 'merge' | 'load' | 'unload'> = {
  merge: {
    validate: (s, team, action) => joinProblem(s, team, action.uid, action.into, (unit, target) => mergeProblem(s, unit, target)),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      // Llevarla a mano a otra unidad acaba su viaje, como mover.
      const cancelled = endTravel(team, unit);
      const path = mergeInto(s, unit, checkedUnit(s, action.into));
      return [...cancelled, joinEvent(team, 'merge', action.uid, action.into, path)];
    },
  },
  load: {
    validate: (s, team, action) => joinProblem(s, team, action.uid, action.into, (unit, transport) => loadProblem(s, unit, transport)),
    apply: (s, team, action) => {
      const unit = checkedUnit(s, action.uid);
      const cancelled = endTravel(team, unit);
      const path = boardTransport(s, unit, checkedUnit(s, action.into));
      return [...cancelled, joinEvent(team, 'load', action.uid, action.into, path)];
    },
  },
  unload: {
    validate: (s, team, action) =>
      actorProblem(s, team, action.uid, (transport) => {
        const passenger = unitById(s, action.passenger);
        return passenger ? unloadProblem(s, transport, passenger, action.to) : 'missing';
      }),
    apply: (s, team, action) => {
      dropPassenger(checkedUnit(s, action.uid), checkedUnit(s, action.passenger), action.to);
      return [{ kind: 'unload', actor: team, uid: action.uid, passenger: action.passenger, to: posOf(action.to) }];
    },
  },
};
