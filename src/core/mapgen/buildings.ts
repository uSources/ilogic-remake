/** Los edificios y las unidades del mapa al azar: los de cada salida y los neutrales. */
import { terrainAt } from '../gameContent';
import { entryOf } from '../content';
import { mapGrid } from '../mapGrid';
import { newUnit } from '../rules/lifecycle';
import { buildingAt, canMoveOn, unitAt } from '../rules/queries';
import type { GridSize } from '../util/grid';
import { randomInt } from '../util/random';
import type { GameState, Pos, Rng, TeamId } from '../model';
import { areaScale, BUILDING_PICK_TRIES, settingsOf } from './common';
import { spawnZone } from './spawns';

/**
 * Muestreo secuencial (como el original): recorre `candidates` y se queda con cada una con
 * probabilidad `wanted / left`; devuelve la elegida o null si no salio ninguna.
 */
function sampleInOrder(candidates: readonly Pos[], wanted: number, rng: Rng, nextLeft: (left: number) => number): Pos | null {
  let left = candidates.length;
  for (const pos of candidates) {
    if (rng() < wanted / left) return pos;
    left = nextLeft(left);
  }
  return null;
}

/** Unidades iniciales (mapgen.json, "startingUnits") cerca del centro de la zona. */
export function placeStartingUnits(s: GameState, spawn: Pos, team: TeamId, rng: Rng): void {
  const starting = settingsOf(s).startingUnits;
  starting.forEach((id, index) => {
    const unitType = entryOf(s.content.units, id, 'unidad');
    const free = spawnZone(s, spawn).filter((pos) => canMoveOn(unitType.movement, terrainAt(s, pos)) && !unitAt(s, pos));
    // Con la probabilidad corregida (las que quedan por poner); si no sale ninguna, la ultima libre.
    const chosen = sampleInOrder(free, starting.length - index, rng, (left) => left - 1) ?? free.at(-1);
    if (chosen) newUnit(s, unitType, team, chosen);
  });
}

/** Edificios iniciales (mapgen.json, "startingBuildings") en la zona de inicio. Falla si no caben. */
export function placeStartingBuildings(s: GameState, spawn: Pos, team: TeamId, rng: Rng): boolean {
  const starting = settingsOf(s).startingBuildings;
  const total = starting.length;
  for (let index = 0; index < total; index++) {
    const free = spawnZone(s, spawn).filter((pos) => terrainAt(s, pos).buildable && !buildingAt(s, pos));
    if (!free.length) return false;
    // El original recorre el rombo dando vueltas; equivale a elegir con prob. creciente.
    let chosen: Pos | null = null;
    for (let tries = 0; !chosen && tries < BUILDING_PICK_TRIES; tries++)
      chosen = sampleInOrder(free, total - index, rng, (left) => Math.max(1, left - 1));
    chosen ??= free[0]!;
    const buildingType = entryOf(s.content.buildings, starting[index]!, 'edificio');
    s.buildings.push({ type: buildingType.id, owner: team, x: chosen.x, y: chosen.y });
  }
  return true;
}

/**
 * Cuantos edificios neutrales de cada tipo, en el orden de buildings.json (mapgen.json,
 * "neutralBuildings" y "neutralTotal", escalado con la superficie).
 */
function rollNeutralCounts(s: GameState, size: GridSize, rng: Rng): number[] {
  const settings = settingsOf(s);
  const [minTotal, maxTotal] = settings.neutralTotal;
  const isTotalAllowed = (total: number) =>
    total >= Math.floor(minTotal * areaScale(size)) && total <= Math.ceil(maxTotal * areaScale(size));
  // Todos los tipos tiran el dado, tambien los que no tienen neutrales: la misma semilla, el mismo mapa.
  const ranges = s.content.buildings.list.map((building) => settings.neutralBuildings[building.id] ?? [0, 0]);
  for (;;) {
    // [CAMBIO] en mapas de otro tamaño, el numero de edificios neutrales se escala con la superficie.
    const scale = areaScale(size);
    const counts = ranges.map(([min, max]) => Math.round(randomInt(rng, min, max) * scale));
    if (isTotalAllowed(counts.reduce((sum, count) => sum + count, 0))) return counts;
  }
}

/** Edificios neutrales repartidos uniformemente por el mapa (algoritmo S de Knuth). */
export function placeNeutralBuildings(s: GameState, rng: Rng): void {
  const map = mapGrid(s);
  const toPlace = rollNeutralCounts(s, map, rng);
  const available = map.createLayer(false);
  let availableCount = 0;
  for (const { pos } of map.cells())
    if (terrainAt(s, pos).buildable && !buildingAt(s, pos)) {
      available.set(pos, true);
      availableCount++;
    }
  toPlace.forEach((count, index) => {
    const type = s.content.buildings.list[index]!.id;
    let missing = count;
    let remaining = availableCount;
    for (const { pos, value: isAvailable } of available.cells()) {
      if (missing <= 0) return;
      if (!isAvailable) continue;
      if (rng() < missing / remaining) {
        s.buildings.push({ type, owner: null, x: pos.x, y: pos.y });
        available.set(pos, false);
        missing--;
        availableCount--;
      }
      remaining--;
    }
  });
}
