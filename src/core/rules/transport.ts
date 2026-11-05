/**
 * Union de unidades iguales y transporte (subir y bajar pasajeros).
 */
import { tablesOf } from '../gameContent';
import { movementOf, freeSlot, isWalkable, occupancy } from './queries';
import { MAX_LIFE } from '../data';
import { manhattan, neighbors4, samePos, posOf } from '../geom';
import { mapGrid } from '../mapGrid';
import { isOnMap } from '../util/predicates';
import type { GameState, Pos, Unit } from '../model';
import { dropStaleCaptures } from './capture';
import { removeUnit } from './lifecycle';
import { ambushed, approachPath, moveRange, walkPath, type MovePath } from './movement';

/** No lleva a nadie dentro (un transporte con pasajeros no se puede unir). */
const isEmpty = (unit: Unit): boolean => unit.cargo.every((uid) => uid === null);

/** Termina el turno de la unidad sin poder volver a moverse. */
function endTurn(unit: Unit): void {
  unit.active = false;
  unit.canMove = false;
}

/** Dos unidades se pueden unir: distintas, del mismo tipo y bando. */
const canMergeWith = (unit: Unit, target: Unit): boolean =>
  target.uid !== unit.uid && target.type === unit.type && target.team === unit.team;

/** Unidades del mismo tipo y bando con las que se puede unir este turno. */
export function mergeTargets(s: GameState, unit: Unit, range = moveRange(s, unit)): Unit[] {
  return s.units.filter(
    (target) =>
      canMergeWith(unit, target) && isOnMap(target) && isEmpty(target) && isEmpty(unit) && approachPath(s, unit, target, range) !== null,
  );
}

/**
 * Union (Unit.Merge): la unidad se mueve hasta la otra y se funden.
 * La vida se suma (tope 100) y se queda la experiencia de la mas veterana.
 * Devuelve el camino recorrido.
 */
export function merge(s: GameState, unit: Unit, target: Unit): MovePath | null {
  if (!unit.active || !canMergeWith(unit, target)) return null;
  const path = approachPath(s, unit, target);
  if (!path) return null;
  const walked = walkPath(s, unit, path);
  if (walked.ambush) return ambushed(s, unit, walked);
  target.life = Math.min(MAX_LIFE, target.life + unit.life);
  // Al unirse se queda la experiencia de la mas veterana.
  if (unit.kills || target.kills) target.kills = Math.max(unit.kills ?? 0, target.kills ?? 0);
  endTurn(target);
  path.push(posOf(target));
  removeUnit(s, unit.uid);
  dropStaleCaptures(s);
  return path;
}

/** El transporte puede llevar a la unidad (del mismo bando y de un tipo que lleva). */
const canCarry = (s: GameState, transport: Unit, passenger: Unit): boolean =>
  transport.team === passenger.team && !!tablesOf(s).CAN_CARRY[transport.type]![passenger.type];

/** Transportes a los que puede subir. [CAMBIO] el original usaba el movimiento del transporte. */
export function loadTargets(s: GameState, unit: Unit, range = moveRange(s, unit)): Unit[] {
  return s.units.filter(
    (transport) =>
      transport.uid !== unit.uid &&
      isOnMap(transport) &&
      canCarry(s, transport, unit) &&
      freeSlot(transport) !== -1 &&
      approachPath(s, unit, transport, range) !== null,
  );
}

/** Subir a un transporte (Unit.Load): la unidad se mueve hasta el y queda dentro. */
export function load(s: GameState, unit: Unit, transport: Unit): MovePath | null {
  if (!unit.active || !canCarry(s, transport, unit) || !isOnMap(unit)) return null;
  const slot = freeSlot(transport);
  if (slot === -1) return null;
  const path = approachPath(s, unit, transport);
  if (!path) return null;
  const walked = walkPath(s, unit, path);
  if (walked.ambush) return ambushed(s, unit, walked);
  path.push(posOf(transport));
  transport.cargo[slot] = unit.uid;
  unit.carrier = transport.uid;
  unit.x = transport.x;
  unit.y = transport.y;
  endTurn(unit);
  dropStaleCaptures(s);
  return path;
}

/** Casillas donde se puede bajar a un pasajero: vecinas transitables y libres. */
export function unloadTiles(s: GameState, transport: Unit, passenger: Unit): Pos[] {
  const movement = movementOf(s, passenger.type);
  const occupied = occupancy(s);
  return neighbors4(mapGrid(s), transport).filter((pos) => isWalkable(s, pos, movement, occupied));
}

/** Bajar a un pasajero (Unit.Unload). El pasajero y el transporte quedan sin poder actuar. */
export function unload(s: GameState, transport: Unit, passenger: Unit, dest: Pos): boolean {
  if (passenger.carrier !== transport.uid || manhattan(transport, dest) !== 1) return false;
  if (!unloadTiles(s, transport, passenger).some((pos) => samePos(pos, dest))) return false;
  transport.cargo[transport.cargo.indexOf(passenger.uid)] = null;
  passenger.carrier = null;
  passenger.x = dest.x;
  passenger.y = dest.y;
  endTurn(passenger);
  endTurn(transport);
  return true;
}
