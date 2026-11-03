/**
 * Unidades: crear y eliminar (con sus pasajeros) y limpiar las que se quedan sin vida.
 */
import { MAX_LIFE, UNIT } from '../data';
import type { GameState, Team, Unit } from '../types';
import { dropStaleCaptures } from './capture';
import { unitById } from './queries';

export function newUnit(s: GameState, type: number, team: Team, x: number, y: number, active = true): Unit {
  const u: Unit = {
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
  s.units.push(u);
  return u;
}

/** Elimina una unidad y, si es un transporte, a sus pasajeros. */
export function removeUnit(s: GameState, uid: number): void {
  const u = unitById(s, uid);
  if (!u) return;
  for (const c of u.cargo) if (c !== null) removeUnit(s, c);
  if (u.carrier !== null) {
    const t = unitById(s, u.carrier);
    if (t) t.cargo = t.cargo.map((c) => (c === uid ? null : c));
  }
  s.units = s.units.filter((o) => o.uid !== uid);
}

/** Limpieza (en el original, cada fotograma): fuera las unidades sin vida. */
export function removeDead(s: GameState): void {
  for (const u of [...s.units]) if (u.life <= 0) removeUnit(s, u.uid);
  dropStaleCaptures(s);
}
