/**
 * Unidades: crear y eliminar (con sus pasajeros) y limpiar las que se quedan sin vida.
 */
import { MAX_LIFE, UNIT } from '../data';
import { isAlive } from '../util/predicates';
import type { GameState, Team, Unit } from '../types';
import { dropStaleCaptures } from './capture';
import { unitById } from './queries';

export function newUnit(s: GameState, type: number, team: Team, x: number, y: number, active = true): Unit {
  const unit: Unit = {
    uid: s.nextUid++,
    type,
    team,
    x,
    y,
    active,
    canMove: active,
    canFire: active,
    life: MAX_LIFE,
    carrier: null,
    cargo: Array<number | null>(UNIT.maxcarry[type]!).fill(null),
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

/** Limpieza (en el original, cada fotograma): fuera las unidades sin vida. */
export function removeDead(s: GameState): void {
  for (const unit of [...s.units]) if (!isAlive(unit)) removeUnit(s, unit.uid);
  dropStaleCaptures(s);
}
