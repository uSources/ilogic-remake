/**
 * Union de unidades iguales y transporte (subir y bajar pasajeros).
 */
import { unitTypeOf } from '../gameContent';
import { movementOf, freeSlot, isWalkable, occupancy } from './queries';
import { MAX_LIFE } from '../data';
import { manhattan, neighbors4, samePos, posOf } from '../geom';
import { mapGrid } from '../mapGrid';
import { isOnMap } from '../util/predicates';
import type { ActionRejection, GameState, Pos, Unit } from '../model';
import { removeUnit } from './lifecycle';
import { approachPath, moveRange } from './movement';
import { traverse, type Traversal } from './traverse';
import { spendUnit } from './unitTurn';

/** No lleva a nadie dentro (un transporte con pasajeros no se puede unir). */
const isEmpty = (unit: Unit): boolean => unit.cargo.every((uid) => uid === null);

/** Dos unidades se pueden unir: distintas, del mismo tipo y equipo. */
const canMergeWith = (unit: Unit, target: Unit): boolean =>
  target.uid !== unit.uid && target.type === unit.type && target.team === unit.team;

/** Unidades del mismo tipo y equipo con las que se puede unir este turno (ver mergeProblem). */
export function mergeTargets(s: GameState, unit: Unit, range = moveRange(s, unit)): Unit[] {
  return s.units.filter((target) => mergeProblem(s, unit, target, range) === null);
}

/**
 * Por que `unit` no se puede unir ahora a `target` (null = puede): tienen que ser distintas, del
 * mismo tipo y equipo, estar en el mapa, ir vacias (un transporte con pasajeros no se une: los
 * perderia) y llegar a su lado este turno.
 */
export function mergeProblem(s: GameState, unit: Unit, target: Unit, range = moveRange(s, unit)): ActionRejection | null {
  if (!canMergeWith(unit, target) || !isOnMap(target)) return 'cannotMerge';
  if (!isEmpty(unit) || !isEmpty(target)) return 'cannotMerge';
  return approachPath(unit, target, range) ? null : 'unreachable';
}

/**
 * El camino hasta otra unidad de una union o una subida ya comprobada (mergeProblem, loadProblem).
 * Si no lo hay, es un fallo de quien llama (como checkedUnit en las acciones).
 */
function checkedApproach(s: GameState, unit: Unit, other: Unit): Pos[] {
  const path = approachPath(unit, other, moveRange(s, unit));
  if (!path) throw new Error(`La unidad ${unit.uid} no llega a ${other.uid} en una union o subida ya comprobada`);
  return path;
}

/**
 * Union (Unit.Merge), ya comprobada (mergeProblem): la unidad se mueve hasta la otra y se funden.
 * La vida se suma (tope 100) y se queda la experiencia de la mas veterana. Devuelve lo recorrido,
 * hasta la otra (si algo corta el camino, se para antes y no llega a unirse: ver traverse).
 */
export function mergeInto(s: GameState, unit: Unit, target: Unit): Traversal {
  const traversal = traverse(s, unit, checkedApproach(s, unit, target));
  if (traversal.interruption) return traversal;
  target.life = Math.min(MAX_LIFE, target.life + unit.life);
  // Al unirse se queda la experiencia de la mas veterana.
  if (unit.kills || target.kills) target.kills = Math.max(unit.kills ?? 0, target.kills ?? 0);
  spendUnit(target);
  removeUnit(s, unit.uid);
  return { path: [...traversal.path, posOf(target)], interruption: null };
}

/** El transporte puede llevar a la unidad (del mismo equipo y de un tipo que lleva). */
const canCarry = (s: GameState, transport: Unit, passenger: Unit): boolean =>
  transport.team === passenger.team && unitTypeOf(s, transport).carries.includes(unitTypeOf(s, passenger).id);

/** Transportes a los que puede subir (ver loadProblem). [CAMBIO] el original usaba el movimiento del transporte. */
export function loadTargets(s: GameState, unit: Unit, range = moveRange(s, unit)): Unit[] {
  return s.units.filter((transport) => loadProblem(s, unit, transport, range) === null);
}

/**
 * Por que `unit` no puede subir ahora a `transport` (null = puede): el transporte la lleva (mismo
 * equipo, un tipo que carga), estan en el mapa, tiene una plaza libre y llega a su lado este turno.
 */
export function loadProblem(s: GameState, unit: Unit, transport: Unit, range = moveRange(s, unit)): ActionRejection | null {
  if (transport.uid === unit.uid || !isOnMap(transport) || !canCarry(s, transport, unit)) return 'cannotLoad';
  if (freeSlot(transport) === -1) return 'cannotLoad';
  return approachPath(unit, transport, range) ? null : 'unreachable';
}

/**
 * Subir a un transporte (Unit.Load), ya comprobado (loadProblem): la unidad se mueve hasta el y queda
 * dentro. Devuelve lo recorrido, hasta el transporte (o hasta donde la para algo: ver traverse).
 */
export function boardTransport(s: GameState, unit: Unit, transport: Unit): Traversal {
  const traversal = traverse(s, unit, checkedApproach(s, unit, transport));
  if (traversal.interruption) return traversal;
  transport.cargo[freeSlot(transport)] = unit.uid;
  unit.carrier = transport.uid;
  unit.x = transport.x;
  unit.y = transport.y;
  spendUnit(unit);
  return { path: [...traversal.path, posOf(transport)], interruption: null };
}

/** Casillas donde se puede bajar a un pasajero: vecinas transitables y libres. */
export function unloadTiles(s: GameState, transport: Unit, passenger: Unit): Pos[] {
  const movement = movementOf(s, passenger);
  const occupied = occupancy(s);
  return neighbors4(mapGrid(s), transport).filter((pos) => isWalkable(s, pos, movement, occupied));
}

/** Por que el transporte no puede bajar ahora a `passenger` en `dest` (null = puede): tiene que llevarlo y ser una casilla vecina libre. */
export function unloadProblem(s: GameState, transport: Unit, passenger: Unit, dest: Pos): ActionRejection | null {
  if (passenger.carrier !== transport.uid || manhattan(transport, dest) !== 1) return 'cannotUnload';
  return unloadTiles(s, transport, passenger).some((pos) => samePos(pos, dest)) ? null : 'cannotUnload';
}

/** Bajar a un pasajero (Unit.Unload), ya comprobado (unloadProblem). El pasajero y el transporte quedan sin poder actuar. */
export function dropPassenger(transport: Unit, passenger: Unit, dest: Pos): void {
  transport.cargo[transport.cargo.indexOf(passenger.uid)] = null;
  passenger.carrier = null;
  passenger.x = dest.x;
  passenger.y = dest.y;
  spendUnit(passenger);
  spendUnit(transport);
}
