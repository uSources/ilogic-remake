/**
 * Union de unidades iguales y transporte (subir y bajar pasajeros).
 */
import { CAN_CARRY, MAX_LIFE, Movement } from '../data';
import { manhattan, neighbors4, samePos } from '../geom';
import type { GameState, Pos, Unit } from '../types';
import { dropStaleCaptures } from './capture';
import { removeUnit } from './lifecycle';
import { ambushed, approachPath, moveRange, walkPath, type MovePath } from './movement';
import { freeSlot, isWalkable, occupancy } from './queries';

/** Unidades del mismo tipo y bando con las que se puede unir este turno. */
export function mergeTargets(s: GameState, u: Unit, range = moveRange(s, u)): Unit[] {
  return s.units.filter(
    (o) =>
      o.uid !== u.uid &&
      o.carrier === null &&
      o.team === u.team &&
      o.type === u.type &&
      o.cargo.every((c) => c === null) &&
      u.cargo.every((c) => c === null) &&
      approachPath(s, u, o, range) !== null,
  );
}

/**
 * Union (Unit.Merge): la unidad se mueve hasta la otra y se funden.
 * La vida se suma (tope 100). [CAMBIO] combustible y municion: se queda el mayor de los dos.
 * Devuelve el camino recorrido.
 */
export function merge(s: GameState, u: Unit, target: Unit): MovePath | null {
  if (!u.active || u.type !== target.type || u.team !== target.team || u.uid === target.uid) return null;
  const path = approachPath(s, u, target);
  if (!path) return null;
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  target.life = Math.min(MAX_LIFE, target.life + u.life);
  // Al unirse se queda la experiencia de la mas veterana.
  if (u.kills || target.kills) target.kills = Math.max(u.kills ?? 0, target.kills ?? 0);
  target.active = false;
  target.canMove = false;
  path.push({ x: target.x, y: target.y });
  removeUnit(s, u.uid);
  dropStaleCaptures(s);
  return path;
}

/** Transportes a los que puede subir. [CAMBIO] el original usaba el movimiento del transporte. */
export function loadTargets(s: GameState, u: Unit, range = moveRange(s, u)): Unit[] {
  return s.units.filter(
    (t) =>
      t.uid !== u.uid &&
      t.carrier === null &&
      t.team === u.team &&
      CAN_CARRY[t.type]![u.type] &&
      freeSlot(t) !== -1 &&
      approachPath(s, u, t, range) !== null,
  );
}

/** Subir a un transporte (Unit.Load): la unidad se mueve hasta el y queda dentro. */
export function load(s: GameState, u: Unit, t: Unit): MovePath | null {
  if (!u.active || u.team !== t.team || !CAN_CARRY[t.type]![u.type] || u.carrier !== null) return null;
  const slot = freeSlot(t);
  if (slot === -1) return null;
  const path = approachPath(s, u, t);
  if (!path) return null;
  const walked = walkPath(s, u, path);
  if (walked.ambush) return ambushed(s, u, walked);
  path.push({ x: t.x, y: t.y });
  t.cargo[slot] = u.uid;
  u.carrier = t.uid;
  u.x = t.x;
  u.y = t.y;
  u.active = false;
  u.canMove = false;
  dropStaleCaptures(s);
  return path;
}

/** Casillas donde se puede bajar a un pasajero: vecinas transitables y libres. */
export function unloadTiles(s: GameState, t: Unit, passenger: Unit): Pos[] {
  const mt = Movement.of(passenger.type);
  const occ = occupancy(s);
  return neighbors4(t).filter((p) => isWalkable(s, p.x, p.y, mt, occ));
}

/** Bajar a un pasajero (Unit.Unload). El pasajero y el transporte quedan sin poder actuar. */
export function unload(s: GameState, t: Unit, passenger: Unit, dest: Pos): boolean {
  if (passenger.carrier !== t.uid || manhattan(t, dest) !== 1) return false;
  if (!unloadTiles(s, t, passenger).some((p) => samePos(p, dest))) return false;
  t.cargo[t.cargo.indexOf(passenger.uid)] = null;
  passenger.carrier = null;
  passenger.x = dest.x;
  passenger.y = dest.y;
  passenger.active = false;
  passenger.canMove = false;
  t.active = false;
  t.canMove = false;
  return true;
}
