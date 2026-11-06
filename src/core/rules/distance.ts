/**
 * Distancia por tierra (mar o aire, segun el tipo de movimiento) sin limite de pasos: cuantos pasos
 * hay desde una casilla a cada una (Auxiliar.getGroundRange). Lo que corta el paso al medir es una
 * estrategia (`Blockers`): nada, cualquier unidad, o los enemigos que ve un equipo.
 */
import type { MoveType } from '../content';
import { neighbors4 } from '../geom';
import { createLayer } from '../mapGrid';
import type { GameState, Pos, TeamId, Unit } from '../model';
import type { Grid } from '../util/grid';
import { terrainAccess } from './movementProfile';
import { occupancy } from './queries';
import { isVisibleFoe, sightOf } from './visibility';

/** Pasos desde el origen hasta cada casilla: 0 en el propio origen, Infinity donde no se llega. */
export type DistanceMap = Grid<number>;

/** Que casillas cortan el paso al medir distancias. */
export type Blockers = (pos: Pos) => boolean;

/** Nada corta el paso: como si no hubiera unidades (lo que falta hasta un sitio cuando se aparten). */
export const noBlockers: Blockers = () => false;

/** Cualquier unidad en el mapa corta el paso, menos `except` (la que mide desde su sitio). */
export function unitsBlock(s: GameState, except?: Unit): Blockers {
  const occupied = occupancy(s);
  if (except) occupied.set(except, false);
  return (pos) => occupied.at(pos);
}

/** Solo cortan el paso los enemigos de `team` que ve (los aliados se atraviesan y los escondidos no se saben). */
export function visibleEnemiesBlock(s: GameState, team: TeamId): Blockers {
  const blocked = createLayer(s, false);
  const sees = sightOf(s, team);
  for (const unit of s.units) if (isVisibleFoe(s, team, unit, sees)) blocked.set(unit, true);
  return (pos) => blocked.at(pos);
}

/**
 * Pasos desde `from` a cada casilla para un tipo de movimiento, sin limite, sin entrar donde corta el
 * paso `blockers` (por defecto nada). El origen no tiene que ser transitable.
 */
export function distanceMap(s: GameState, from: Pos, movement: MoveType, blockers: Blockers = noBlockers): DistanceMap {
  const access = terrainAccess(s, movement);
  const distance = createLayer(s, Infinity);
  distance.set(from, 0);
  // Busqueda en anchura: cada vuelta avanza un paso desde todo lo alcanzado en la anterior.
  let frontier: Pos[] = [from];
  for (let step = 1; frontier.length; step++) {
    const next: Pos[] = [];
    for (const tile of frontier.flatMap((pos) => neighbors4(distance, pos))) {
      if (distance.at(tile) !== Infinity || !access.canEnter(tile) || blockers(tile)) continue;
      distance.set(tile, step);
      next.push(tile);
    }
    frontier = next;
  }
  return distance;
}
