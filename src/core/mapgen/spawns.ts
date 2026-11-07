/** Las zonas de salida del mapa al azar: donde caben, conectadas a pie y separadas. */
import { terrainAt } from '../gameContent';
import { diamond, manhattan } from '../geom';
import { mapGrid } from '../mapGrid';
import { distanceMap, type DistanceMap } from '../rules/distance';
import type { GridSize } from '../util/grid';
import type { GameState, Pos } from '../model';
import { isWalkable, landMovementOf, ORIGINAL_MAP_SIDE, settingsOf } from './common';

/** Hay bastante sitio para edificios y unidades en la zona de inicio alrededor de `pos`. */
function hasRoomToStart(s: GameState, pos: Pos): boolean {
  const zone = spawnZone(s, pos).map((tile) => terrainAt(s, tile));
  return (
    zone.filter((terrain) => terrain.buildable).length >= settingsOf(s).minSpawnBuildable &&
    zone.filter((terrain) => isWalkable(s, terrain)).length >= settingsOf(s).minSpawnWalkable
  );
}

/** Casillas del mapa columna a columna; con `fromTheEnd`, empezando por la esquina opuesta. */
function* scanOrder(size: GridSize, fromTheEnd: boolean): Generator<Pos> {
  const { width, height } = size;
  for (let i = 0; i < width; i++)
    for (let j = 0; j < height; j++) yield fromTheEnd ? { x: width - 1 - i, y: height - 1 - j } : { x: i, y: j };
}

/** Zona de inicio (RandomMap.getSpawn): la primera casilla a pie con bastante sitio alrededor. */
export function findSpawn(s: GameState, fromTheEnd: boolean, accept: (pos: Pos) => boolean): Pos | null {
  for (const pos of scanOrder(mapGrid(s), fromTheEnd))
    if (isWalkable(s, terrainAt(s, pos)) && hasRoomToStart(s, pos) && accept(pos)) return pos;
  return null;
}

/** Una zona de salida y los pasos a pie desde ella a cada casilla. */
export interface SpawnDistances {
  spawn: Pos;
  distances: DistanceMap;
}

/** Los pasos a pie desde `spawn` (sin unidades en medio). */
export const walkingFrom = (s: GameState, spawn: Pos): SpawnDistances => ({ spawn, distances: distanceMap(s, spawn, landMovementOf(s)) });

/** Se llega a pie a `pos` desde la salida (y no es la propia salida). */
export function walksTo(from: SpawnDistances, pos: Pos): boolean {
  const steps = from.distances.at(pos);
  return steps > 0 && steps < Infinity;
}

/**
 * Las demas zonas, una tras otra: cada una tiene que poder alcanzarse a pie desde todas las de antes
 * y estar lejos de ellas. Se buscan desde la esquina opuesta a la primera.
 */
export function findMoreSpawns(s: GameState, first: Pos, count: number): Pos[] | null {
  const minDistance = Math.round((settingsOf(s).minSpawnDistance * mapGrid(s).width) / ORIGINAL_MAP_SIDE);
  const spawns = [walkingFrom(s, first)];
  while (spawns.length < count) {
    const isFarFromAll = (pos: Pos) => spawns.every((earlier) => walksTo(earlier, pos) && manhattan(pos, earlier.spawn) >= minDistance);
    const next = findSpawn(s, true, isFarFromAll);
    if (!next) return null;
    spawns.push(walkingFrom(s, next));
  }
  return spawns.map((found) => found.spawn);
}

/** La zona de inicio alrededor de una salida (mapgen.json, "spawnRadius"). */
export const spawnZone = (s: GameState, spawn: Pos) => [...diamond(mapGrid(s), spawn, 0, settingsOf(s).spawnRadius)];
