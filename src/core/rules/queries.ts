/**
 * Consultas basicas sobre el estado: que hay en una casilla, por donde se puede andar, de quien es
 * cada unidad. Sin efectos. Es la base del resto de reglas (no importa ningun otro modulo de rules/).
 */
import { Movement, type MoveType } from '../data';
import { createLayer, isOnBoard, terrainAt } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { samePos } from '../geom';
import type { Building, GameState, Pos, Team, Unit } from '../model';

export function unitById(s: GameState, uid: number | null): Unit | undefined {
  return uid === null ? undefined : s.units.find((unit) => unit.uid === uid);
}

/** Unidad (no transportada) en una casilla. */
export function unitAt(s: GameState, pos: Pos): Unit | undefined {
  return s.units.find((unit) => isOnMap(unit) && samePos(unit, pos));
}

export function buildingAt(s: GameState, pos: Pos): Building | undefined {
  return s.buildings.find((building) => samePos(building, pos));
}

/** Mapa de ocupacion: true donde hay una unidad no transportada. */
export function occupancy(s: GameState): Grid<boolean> {
  const occupied = createLayer(s, false);
  for (const unit of s.units) if (isOnMap(unit)) occupied.set(unit, true);
  return occupied;
}

export function canWalk(s: GameState, pos: Pos, moveType: MoveType): boolean {
  return isOnBoard(s, pos) && Movement.canWalk(moveType, terrainAt(s, pos));
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, pos: Pos, moveType: MoveType, occ = occupancy(s)): boolean {
  return canWalk(s, pos, moveType) && !occ.at(pos);
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
