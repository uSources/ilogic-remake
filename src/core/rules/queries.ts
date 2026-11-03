/**
 * Consultas basicas sobre el estado: que hay en una casilla, por donde se puede andar, de quien es
 * cada unidad. Sin efectos. Es la base del resto de reglas (no importa ningun otro modulo de rules/).
 */
import { Movement, type MoveType } from '../data';
import { grid, inBounds } from '../geom';
import type { Building, GameState, Team, Unit } from '../types';

export function unitById(s: GameState, uid: number | null): Unit | undefined {
  return uid === null ? undefined : s.units.find((u) => u.uid === uid);
}

/** Unidad (no transportada) en una casilla. */
export function unitAt(s: GameState, x: number, y: number): Unit | undefined {
  return s.units.find((u) => u.carrier === null && u.x === x && u.y === y);
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  return s.buildings.find((b) => b.x === x && b.y === y);
}

/** Mapa de ocupacion: true donde hay una unidad no transportada. */
export function occupancy(s: GameState): boolean[][] {
  const occ = grid(false);
  for (const u of s.units) if (u.carrier === null) occ[u.x]![u.y] = true;
  return occ;
}

export function canWalk(s: GameState, x: number, y: number, moveType: MoveType): boolean {
  return inBounds(x, y) && Movement.canWalk(moveType, s.map[x]![y]!);
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, x: number, y: number, moveType: MoveType, occ = occupancy(s)): boolean {
  return canWalk(s, x, y, moveType) && !occ[x]![y];
}

export function teamUnits(s: GameState, team: Team): Unit[] {
  return s.units.filter((u) => u.team === team);
}

/** Primera plaza libre de un transporte (-1 si va lleno o no lleva a nadie). */
export function freeSlot(t: Unit): number {
  return t.cargo.indexOf(null);
}

/** Pasajeros de un transporte. */
export function cargoUnits(s: GameState, t: Unit): Unit[] {
  return t.cargo.map((c) => unitById(s, c)).filter((c): c is Unit => !!c);
}
