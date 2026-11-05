/**
 * Comprobaciones que comparten las acciones: que las unidades que nombra existen, son del equipo que
 * la manda y aun pueden actuar. Cada una devuelve por que no vale (o null), para encadenarlas con `??`.
 */
import { unitById } from '../rules/queries';
import { canStillAct } from '../rules/unitTurn';
import { isOnMap } from '../util/predicates';
import type { ActionRejection, GameState, TeamId, Unit } from '../model';

/** Lo que se comprueba despues con la unidad ya encontrada (por defecto, nada mas). */
type ThenCheck = (unit: Unit) => ActionRejection | null;
const nothingMore: ThenCheck = () => null;

/** La unidad `uid` existe y es del equipo; si es asi, sigue con `then(unit)`. */
export function ownUnitProblem(s: GameState, team: TeamId, uid: number, then: ThenCheck = nothingMore): ActionRejection | null {
  const unit = unitById(s, uid);
  if (!unit) return 'missing';
  return unit.team === team ? then(unit) : 'notYours';
}

/** La unidad `uid` es del equipo y esta en el mapa (no dentro de un transporte); despues, `then(unit)`. */
export function ownUnitOnMapProblem(s: GameState, team: TeamId, uid: number, then: ThenCheck = nothingMore): ActionRejection | null {
  return ownUnitProblem(s, team, uid, (unit) => (isOnMap(unit) ? then(unit) : 'transported'));
}

/**
 * La unidad `uid` es del equipo, esta en el mapa y aun puede actuar este turno: la que hace la
 * accion. Despues, lo propio de la accion con la unidad ya encontrada: `then(unit)`.
 */
export function actorProblem(s: GameState, team: TeamId, uid: number, then: ThenCheck = nothingMore): ActionRejection | null {
  return ownUnitOnMapProblem(s, team, uid, (unit) => (canStillAct(unit) ? then(unit) : 'spent'));
}

/** Hay al menos una unidad y todas existen y son del equipo. */
export function ownUnitsProblem(s: GameState, team: TeamId, uids: readonly number[]): ActionRejection | null {
  if (!uids.length) return 'missing';
  for (const uid of uids) {
    const problem = ownUnitProblem(s, team, uid);
    if (problem) return problem;
  }
  return null;
}

/**
 * La unidad de una accion ya comprobada. Si no esta, es un fallo del registro (validate la ha dejado
 * pasar), no algo que pueda pedir quien juega.
 */
export function checkedUnit(s: GameState, uid: number): Unit {
  const unit = unitById(s, uid);
  if (!unit) throw new Error(`La unidad ${uid} de una accion ya comprobada no existe`);
  return unit;
}

/** Las unidades de una accion ya comprobada, en su orden. */
export const checkedUnits = (s: GameState, uids: readonly number[]): Unit[] => uids.map((uid) => checkedUnit(s, uid));
