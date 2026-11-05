/**
 * Unidades: crear y eliminar (con sus pasajeros) y limpiar las que se quedan sin vida.
 */
import type { UnitType } from '../content';

import { MAX_LIFE } from '../data';
import { isAlive } from '../util/predicates';
import type { GameState, Pos, TeamId, Unit, UnitTurnState } from '../model';
import { unitById } from './queries';

/** Una unidad nueva en `at`, sin usar (o en el punto de su turno que se diga: las compradas nacen gastadas). */
export function newUnit(s: GameState, unitType: UnitType, team: TeamId, at: Pos, turnState: UnitTurnState = 'ready'): Unit {
  const unit: Unit = {
    uid: s.nextUid++,
    type: unitType.id,
    team,
    x: at.x,
    y: at.y,
    turnState,
    life: MAX_LIFE,
    carrier: null,
    cargo: Array<number | null>(unitType.cargoSlots).fill(null),
  };
  s.units.push(unit);
  return unit;
}

/** Elimina una unidad y, si es un transporte, a sus pasajeros. */
export function removeUnit(s: GameState, uid: number): void {
  const unit = unitById(s, uid);
  if (!unit) return;
  for (const passengerUid of unit.cargo) if (passengerUid !== null) removeUnit(s, passengerUid);
  freeSeatOf(s, unit);
  s.units = s.units.filter((other) => other.uid !== uid);
}

/** Si la unidad va dentro de un transporte, deja libre su plaza. */
function freeSeatOf(s: GameState, passenger: Unit): void {
  if (passenger.carrier === null) return;
  const transport = unitById(s, passenger.carrier);
  if (transport) transport.cargo = transport.cargo.map((uid) => (uid === passenger.uid ? null : uid));
}

/**
 * Limpieza (en el original, cada fotograma): fuera las unidades sin vida. Es una de las INVARIANTS
 * (actions/invariants.ts), que `dispatch` repasa despues de cada accion.
 */
export function removeDead(s: GameState): void {
  for (const unit of [...s.units]) if (!isAlive(unit)) removeUnit(s, unit.uid);
}
