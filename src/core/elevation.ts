/**
 * [CAMBIO] La altura de cada casilla (el original era plano): un nivel de 0 a `MAX_ELEVATION` en
 * `GameState.elevation` (map[x][y], como el terreno). La tiene toda partida: la prepara el modulo del
 * relieve al empezar (`elevationFor`, ruleModules/relief.ts) y no cambia; las montañas son lo alto.
 * Aqui solo se calcula y se pregunta; lo que hace la altura en el juego (acierto, vision, subir) va
 * con el ajuste `elevation` (ruleModules/elevation.ts).
 *
 * Las alturas salen del propio mapa (su terreno), sin azar de la partida: el mismo mapa da siempre
 * las mismas, sea una escaramuza, una mision o una partida cargada.
 */
import { terrainAt } from './gameContent';
import { neighbors4 } from './geom';
import { createLayer, mapGrid } from './mapGrid';
import type { GameState, Pos } from './model';
import type { Grid, GridBounds } from './util/grid';
import { seededRng } from './util/random';
import { valueNoise } from './util/valueNoise';

/** El nivel mas alto (los niveles van de 0, el del agua, a este). */
export const MAX_ELEVATION = 2;
/** Cada cuantas casillas cambia el relieve (el tamaño de las colinas). */
const HILL_SPACING = 5;
/** Por debajo de esto es llano (0); hasta el siguiente, colina (1); encima, alto (2). */
const LEVEL_THRESHOLDS = [0.45, 0.72] as const;
/** Los terrenos que no dejan pasar a los vehiculos (montañas) se ven y se juegan como lo alto. */
const CLIFF_MOVEMENT = 'vehicle';

/** La altura de una casilla (0 si la partida no lleva elevacion). */
export function elevationAt(s: Pick<GameState, 'elevation'>, pos: Pos): number {
  return s.elevation?.[pos.x]?.[pos.y] ?? 0;
}

/** Cuantos niveles esta `from` por encima de `to` (negativo: por debajo). */
export const heightDifference = (s: Pick<GameState, 'elevation'>, from: Pos, to: Pos): number => elevationAt(s, from) - elevationAt(s, to);

/** Un numero que sale del terreno del mapa (la semilla de su relieve): el mismo mapa, el mismo numero. */
function mapSeed(s: GameState): number {
  let hash = 2166136261;
  for (const column of s.map)
    for (const terrain of column) for (const char of terrain) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

/** Un relieve suave de 0 a 1 (las colinas), que sale del terreno del mapa. */
const smoothRelief = (s: GameState): Grid<number> => valueNoise(mapGrid(s), HILL_SPACING, seededRng(mapSeed(s)));

/** El nivel que pide el relieve en una casilla: 0 en el agua; las montañas, arriba del todo. */
function wantedLevel(s: GameState, pos: Pos, relief: number): number {
  const terrain = terrainAt(s, pos);
  if (terrain.isWater) return 0;
  if (terrain.moveCost[CLIFF_MOVEMENT] === null) return MAX_ELEVATION;
  return LEVEL_THRESHOLDS.filter((threshold) => relief >= threshold).length;
}

/**
 * Baja lo que haga falta para que entre vecinas no haya mas de un nivel (se puede subir y bajar
 * siempre, nivel a nivel) y el agua siga en 0: cada casilla, como mucho la mas baja de sus vecinas + 1.
 */
function softenSteps(s: GameState, levels: Grid<number>): void {
  for (let changed = true; changed;) {
    changed = false;
    levels.forEach((level, pos) => {
      const lowest = Math.min(...neighbors4(levels, pos).map((next) => levels.at(next)));
      if (level <= lowest + 1 || terrainAt(s, pos).isWater) return;
      levels.set(pos, lowest + 1);
      changed = true;
    });
  }
}

/** Las alturas de la partida (map[x][y]), del relieve de su mapa. */
export function elevationFor(s: GameState): number[][] {
  const relief = smoothRelief(s);
  const levels = createLayer(s, 0);
  levels.forEach((_, pos) => levels.set(pos, wantedLevel(s, pos, relief.at(pos))));
  softenSteps(s, levels);
  return Array.from({ length: levels.width }, (_, x) => Array.from({ length: levels.height }, (_, y) => levels.at({ x, y })));
}

/** Unas alturas guardadas son validas: una por casilla del mapa, enteras entre 0 y MAX_ELEVATION. */
export function isElevationGrid(board: GridBounds, value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== board.width) return false;
  const isLevel = (level: unknown) => Number.isInteger(level) && (level as number) >= 0 && (level as number) <= MAX_ELEVATION;
  return value.every((column: unknown) => Array.isArray(column) && column.length === board.height && column.every(isLevel));
}
