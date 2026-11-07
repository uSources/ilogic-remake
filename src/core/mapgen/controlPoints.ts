/** [CAMBIO] Los puntos de control del mapa al azar (regla controlPoints). */
import { terrainAt } from '../gameContent';
import { manhattan, squareArea } from '../geom';
import { mapGrid } from '../mapGrid';
import { buildingAt, unitAt } from '../rules/queries';
import type { GameState, Pos, Rng } from '../model';
import { isWalkable } from './common';
import { walkingFrom, walksTo, type SpawnDistances } from './spawns';

/** Parte de la zona de un punto de control que tiene que ser tierra para poder pelear por ella. */
const MIN_CONTROL_LAND = 0.6;
/** Ni pegados a las salidas: al menos esta parte del camino entre ellas. */
const MIN_CONTROL_SPAWN_SHARE = 1 / 4;
/** Azar que se suma a la puntuacion para que no salgan siempre igual. */
const CONTROL_SCORE_NOISE = 1.5;
/** Puntuacion maxima (diferencia de distancias a las salidas) para valer como punto de control. */
const MAX_CONTROL_SCORE = 4;

function isMostlyLand(s: GameState, center: Pos): boolean {
  const zone = squareArea(mapGrid(s), center, s.settings.controlRadius);
  return zone.filter((pos) => isWalkable(s, terrainAt(s, pos))).length >= zone.length * MIN_CONTROL_LAND;
}

/** Casilla libre de tierra y no pegada a ninguna salida (`toSpawns`: distancia a pie a cada una, a las que llega). */
function isControlSpot(s: GameState, pos: Pos, toSpawns: readonly number[], span: number): boolean {
  if (!isWalkable(s, terrainAt(s, pos)) || buildingAt(s, pos) || unitAt(s, pos)) return false;
  if (Math.min(...toSpawns) < span * MIN_CONTROL_SPAWN_SHARE) return false;
  return isMostlyLand(s, pos);
}

/** Lo que hay del camino mas corto entre dos salidas (a pie; en linea si no se llega). */
function shortestSpan(spawns: readonly SpawnDistances[]): number {
  const walkOrLine = (from: SpawnDistances, to: Pos) => (walksTo(from, to) ? from.distances.at(to) : manhattan(from.spawn, to));
  const spans = spawns.flatMap((from, i) => spawns.slice(i + 1).map((other) => walkOrLine(from, other.spawn)));
  return Math.min(...spans);
}

/**
 * [CAMBIO] Puntos de control (regla controlPoints): zonas de tierra, con el centro igual de lejos (a
 * pie) de todas las zonas de salida, ni pegadas a ellas ni entre si. Asi hay algo por lo que pelear
 * en el medio del mapa. Si no caben todos, pone los que pueda.
 */
export function placeControlPoints(s: GameState, spawns: readonly Pos[], rng: Rng): void {
  const wanted = s.settings.controlPoints;
  if (wanted <= 0) return;
  const fromSpawns = spawns.map((spawn) => walkingFrom(s, spawn));
  const span = shortestSpan(fromSpawns);
  const candidates: { pos: Pos; score: number }[] = [];
  for (const { pos } of mapGrid(s).cells()) {
    if (!fromSpawns.every((from) => walksTo(from, pos))) continue;
    const toSpawns = fromSpawns.map((from) => from.distances.at(pos));
    if (!isControlSpot(s, pos, toSpawns, span)) continue;
    // Lo justo: la misma distancia a todas las salidas (con dos, la diferencia entre ellas).
    const spread = Math.max(...toSpawns) - Math.min(...toSpawns);
    candidates.push({ pos, score: spread + rng() * CONTROL_SCORE_NOISE });
  }
  candidates.sort((first, second) => first.score - second.score);
  const minGap = Math.max(3, Math.round(mapGrid(s).width / 4)) + 2 * s.settings.controlRadius;
  const chosen: Pos[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= wanted || candidate.score > MAX_CONTROL_SCORE) break;
    if (chosen.every((other) => manhattan(other, candidate.pos) >= minGap)) chosen.push(candidate.pos);
  }
  if (chosen.length) s.controlPoints = chosen.map((pos) => ({ ...pos, owner: null }));
}
