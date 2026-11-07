/**
 * Consultas basicas sobre el estado: que hay en una casilla, por donde se puede andar, de quien es
 * cada unidad. Sin efectos. Es la base del resto de reglas (no importa ningun otro modulo de rules/).
 */
import type { MoveType, TerrainType } from '../content';
import { isHq, unitTypeOf, terrainAt } from '../gameContent';
import { createLayer, isOnBoard } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isOnMap } from '../util/predicates';
import { samePos } from '../geom';
import { isHostileOwner } from '../teams';
import type { Building, GameState, Pos, TeamId, Unit } from '../model';

/** Tipo de movimiento de una unidad. */
export function movementOf(s: GameState, unit: Pick<Unit, 'type'>): MoveType {
  return unitTypeOf(s, unit).movement;
}

/** Ese tipo de movimiento puede pasar por ese terreno. */
export function canMoveOn(moveType: MoveType, terrain: TerrainType): boolean {
  return terrain.moveCost[moveType] !== null;
}

/**
 * Lo que le cuesta a ese tipo de movimiento entrar en ese terreno (solo cuenta con la regla
 * terrainCost). Donde no se puede pasar cuenta 1, como siempre (no se llega a pagar).
 */
export function terrainMoveCost(moveType: MoveType, terrain: TerrainType): number {
  return terrain.moveCost[moveType] ?? 1;
}

export function unitById(s: GameState, uid: number | null | undefined): Unit | undefined {
  return uid === null || uid === undefined ? undefined : s.units.find((unit) => unit.uid === uid);
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
  return isOnBoard(s, pos) && canMoveOn(moveType, terrainAt(s, pos));
}

/** Transitable y libre de unidades (amigas o enemigas: no se puede atravesar a nadie). */
export function isWalkable(s: GameState, pos: Pos, moveType: MoveType, occupied = occupancy(s)): boolean {
  return canWalk(s, pos, moveType) && !occupied.at(pos);
}

/** Las unidades del equipo `team`: las de la partida o, si se dan, las suyas de entre `among`. */
export function teamUnits(s: GameState, team: TeamId, among: readonly Unit[] = s.units): Unit[] {
  return among.filter((unit) => unit.team === team);
}

/** Primera plaza libre de un transporte (-1 si va lleno o no lleva a nadie). */
export function freeSlot(transport: Unit): number {
  return transport.cargo.indexOf(null);
}

/** Pasajeros de un transporte. */
export function cargoUnits(s: GameState, transport: Unit): Unit[] {
  return transport.cargo.map((uid) => unitById(s, uid)).filter((passenger): passenger is Unit => !!passenger);
}

/** El edificio es la Base de un enemigo de `team`. */
export const isEnemyHq = (s: GameState, building: Building, team: TeamId): boolean =>
  isHq(s, building) && isHostileOwner(s, building.owner, team);

/** Los edificios que son del equipo `team`. */
export const buildingsOf = (s: GameState, team: TeamId): Building[] => s.buildings.filter((building) => building.owner === team);
