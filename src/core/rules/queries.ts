/**
 * Consultas basicas sobre el estado: que hay en una casilla, por donde se puede andar, de quien es
 * cada unidad. Sin efectos. Es la base del resto de reglas (no importa ningun otro modulo de rules/).
 */
import { Movement, type MoveType } from '../data';
import { grid, inBounds } from '../geom';
import { cellAt, setCell } from '../util/grid';
import { isOnMap } from '../util/predicates';
import type { Building, GameState, Team, Unit } from '../model';

export function unitById(s: GameState, uid: number | null): Unit | undefined {
  return uid === null ? undefined : s.units.find((unit) => unit.uid === uid);
}

/** Unidad (no transportada) en una casilla. */
export function unitAt(s: GameState, x: number, y: number): Unit | undefined {
  return s.units.find((unit) => isOnMap(unit) && unit.x === x && unit.y === y);
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  return s.buildings.find((building) => building.x === x && building.y === y);
}

/** Mapa de ocupacion: true donde hay una unidad no transportada. */
export function occupancy(s: GameState): boolean[][] {
  const occupied = grid(false);
  for (const unit of s.units) if (isOnMap(unit)) setCell(occupied, unit, true);
  return occupied;
}

export function canWalk(s: GameState, x: number, y: number, moveType: MoveType): boolean {
  return inBounds(x, y) && Movement.canWalk(moveType, cellAt(s.map, { x, y }));
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, x: number, y: number, moveType: MoveType, occ = occupancy(s)): boolean {
  return canWalk(s, x, y, moveType) && !cellAt(occ, { x, y });
}

export function teamUnits(s: GameState, team: Team): Unit[] {
  return s.units.filter((unit) => unit.team === team);
}

/** Primera plaza libre de un transporte (-1 si va lleno o no lleva a nadie). */
export function freeSlot(transport: Unit): number {
  return transport.cargo.indexOf(null);
}

/** Pasajeros de un transporte. */
export function cargoUnits(s: GameState, transport: Unit): Unit[] {
  return transport.cargo.map((uid) => unitById(s, uid)).filter((passenger): passenger is Unit => !!passenger);
}
