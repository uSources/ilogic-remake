/**
 * [CAMBIO] Las cordilleras del mapa al azar: en el original las montañas salian sueltas, casilla a
 * casilla (como un acantilado aqui y otro alli); ahora se levantan en sierras, donde un ruido de
 * crestas es mas alto, y cubren la parte de la tierra que diga el tema (themes.json,
 * "generator.mountains"). Donde una sierra parte en dos la tierra por la que se pasa sin ella
 * (mapgen.json, "passMovement": los vehiculos), se abre un paso por lo mas bajo de la cresta. Lo alto
 * de cada casilla (core/elevation.ts) sale despues de ellas.
 */
import { terrainAt, themeOf } from '../gameContent';
import type { MountainRanges } from '../content';
import { neighbors4 } from '../geom';
import { createLayer, mapGrid } from '../mapGrid';
import { distanceMap } from '../rules/distance';
import type { GameState, Pos, Rng } from '../model';
import { Grid } from '../util/grid';
import { seededRng, seedFromDraw } from '../util/random';
import { minBy } from '../util/pick';
import { valueNoise } from '../util/valueNoise';
import { settingsOf } from './common';

/** Cuanto mas grande que las crestas es el ruido que las corta en tramos (deja pasos entre sierras). */
const GAP_SCALE = 1.3;
/** Lo que pesa ese corte: con 0 las crestas serian lineas sin fin; con 1, sierras sueltas. */
const GAP_WEIGHT = 0.85;

/**
 * Las crestas: el ruido suave doblado por la mitad (alto donde pasaba por 0,5, como una linea de
 * cumbres) y cortado en tramos por otro ruido mas ancho.
 */
function ridges(s: GameState, ranges: MountainRanges, rng: Rng): Grid<number> {
  const board = mapGrid(s);
  const crest = valueNoise(board, ranges.spacing, rng);
  const gaps = valueNoise(board, ranges.spacing * GAP_SCALE, rng);
  const crests = board.createLayer(0);
  crests.forEach((_, pos) => crests.set(pos, (1 - Math.abs(2 * crest.at(pos) - 1)) * (1 - GAP_WEIGHT + GAP_WEIGHT * gaps.at(pos))));
  return crests;
}

/** Levanta las sierras del tema (si tiene): la tierra con las crestas mas altas pasa a ser montaña. */
export function raiseMountains(s: GameState, rng: Rng): void {
  const ranges = themeOf(s).generator.mountains;
  // Siempre se tira el dado, aunque el tema no tenga montañas, para no mover el resto de la secuencia.
  const ridgeRng = seededRng(seedFromDraw(rng()));
  if (!ranges) return;
  const crests = ridges(s, ranges, ridgeRng);
  const board = mapGrid(s);
  const ground = Grid.wrap(board.columns.map((column) => [...column]));
  const land: Pos[] = [...board.cells()].map((cell) => cell.pos).filter((pos) => !terrainAt(s, pos).isWater);
  const highest = land.sort((a, b) => crests.at(b) - crests.at(a)).slice(0, Math.round(land.length * ranges.share));
  for (const pos of highest) board.set(pos, ranges.terrain);
  openPasses(s, crests, ground);
}

/**
 * Mientras alguna montaña separe dos trozos de tierra por los que se pasa (con "passMovement"), la mas
 * baja de esas vuelve a ser lo que era: un paso entre sierras.
 */
function openPasses(s: GameState, crests: Grid<number>, ground: Grid<string>): void {
  for (;;) {
    const regions = passableRegions(s);
    const splitters = [...mapGrid(s).cells()]
      .map((cell) => cell.pos)
      .filter((pos) => regions.at(pos) === NO_REGION && !terrainAt(s, pos).isWater && touchedRegions(regions, pos) > 1);
    const pass = minBy(splitters, (pos) => crests.at(pos));
    if (!pass) return;
    mapGrid(s).set(pass, ground.at(pass));
  }
}

/** Fuera de los trozos de tierra por los que se pasa (montaña, agua). */
const NO_REGION = -1;

/** A que trozo de tierra pertenece cada casilla por la que se pasa (NO_REGION si no se pasa). */
function passableRegions(s: GameState): Grid<number> {
  const movement = settingsOf(s).passMovement;
  const regions = createLayer(s, NO_REGION);
  let next = 0;
  regions.forEach((region, pos) => {
    if (region !== NO_REGION || !canPass(s, pos, movement)) return;
    distanceMap(s, pos, movement).forEach((distance, reached) => {
      if (distance !== Infinity) regions.set(reached, next);
    });
    next++;
  });
  return regions;
}

const canPass = (s: GameState, pos: Pos, movement: string): boolean => terrainAt(s, pos).moveCost[movement] != null;

/** Cuantos trozos distintos tocan esta casilla (por sus cuatro lados). */
const touchedRegions = (regions: Grid<number>, pos: Pos): number =>
  new Set(
    neighbors4(regions, pos)
      .map((next) => regions.at(next))
      .filter((region) => region !== NO_REGION),
  ).size;
