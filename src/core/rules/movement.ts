/**
 * Movimiento y caminos: las reglas de cada paso (`stepAllowed`), el alcance de cada unidad, los
 * caminos trazados y la distancia por tierra. Como se mueve cada tipo esta en movementProfile.ts, lo
 * que hacen las demas unidades en passage.ts y recorrer un camino de verdad en traverse.ts.
 */
import { manhattan, neighbors4, posKey, samePos, posOf } from '../geom';
import { createLayer, mapGrid } from '../mapGrid';
import type { Grid } from '../util/grid';
import { minBy } from '../util/pick';
import type { MoveType } from '../content';
import type { GameState, Pos, Unit } from '../model';
import { movementOf, canWalk, isWalkable, occupancy } from './queries';
import { movementProfile, type MovementProfile } from './movementProfile';
import { surroundingsOf, type Surroundings } from './passage';
import { canStillMove } from './unitTurn';

/**
 * Por donde puede ir una unidad este turno, sin camino aun: desde donde sale, su movimiento (terreno,
 * coste y lo que puede gastar) y lo que encuentra en cada casilla. Cada paso lo juzga `stepAllowed`.
 */
export interface MoveRules extends Surroundings {
  readonly origin: Pos;
  readonly profile: MovementProfile;
}

/** El alcance de una unidad este turno: sus reglas de paso y lo que cuesta llegar a cada casilla. */
export interface MoveRange extends MoveRules {
  /** Lo que cuesta acabar en cada casilla; null = no puede acabar alli (no llega, solo puede pasar o ya esta alli). */
  readonly steps: Grid<number | null>;
  /** Casilla previa en el camino mas barato (tambien por las casillas de paso: aliados). */
  readonly prev: Grid<Pos | null>;
}

/** Las reglas de paso de `unit` desde donde esta, con lo que hay ahora en la partida. */
export function moveRulesOf(s: GameState, unit: Unit): MoveRules {
  return { origin: posOf(unit), profile: movementProfile(s, unit), ...surroundingsOf(s, unit) };
}

/** Un paso de un camino: de `from` a `to`, con `spent` ya gastado antes de darlo. */
export interface Step {
  readonly from: Pos;
  readonly to: Pos;
  readonly spent: number;
}

/**
 * Como acaba un paso: en la casilla (`walk`) o dentro de la unidad que hay en ella (`join`: unirse o
 * subir a un transporte, que no pisa su terreno ni choca con ella).
 */
export type StepKind = 'walk' | 'join';

/** Desde `from` se puede seguir: es de donde sale o no es una casilla en la que haya que pararse. */
const canGoOnFrom = (rules: MoveRules, from: Pos): boolean => samePos(from, rules.origin) || !rules.mustStop.at(from);

/** Puede entrar en `to` (`walk`): un terreno de su tipo, sin nadie que le cierre el paso y que no sea de donde sale. */
const canStepOnto = (rules: MoveRules, to: Pos): boolean =>
  rules.profile.canEnter(to) && rules.tiles.at(to) !== 'blocked' && !samePos(to, rules.origin);

/**
 * La unica regla de cada paso de un movimiento (alcance, caminos trazados, el rastro del cursor y
 * acercarse para unirse o subir): a una vecina, sin seguir desde una casilla en la que hay que
 * pararse, a una casilla en la que puede entrar (o a la unidad en la que entra) y sin pasarse de lo
 * que puede gastar.
 */
export function stepAllowed(rules: MoveRules, step: Step, kind: StepKind = 'walk'): boolean {
  if (manhattan(step.from, step.to) !== 1 || !canGoOnFrom(rules, step.from)) return false;
  if (kind === 'walk' && !canStepOnto(rules, step.to)) return false;
  return step.spent + rules.profile.enterCost(step.to) <= rules.profile.budget;
}

/** Saca de `open` la casilla mas barata de llegar (la primera si empatan) y la devuelve. */
function takeCheapest(open: Pos[], cheapest: Grid<number>): Pos | null {
  const best = minBy(open, (pos) => cheapest.at(pos));
  if (best) open.splice(open.indexOf(best), 1);
  return best;
}

/**
 * Alcance de movimiento de la unidad desde donde esta: `steps` es lo que cuesta llegar a cada casilla
 * en la que se puede terminar, `prev` el camino mas barato. No mira si ya se ha movido este turno:
 * es hasta donde llegaria en su turno.
 */
export function moveRange(s: GameState, unit: Unit): MoveRange {
  const rules = moveRulesOf(s, unit);
  const steps = createLayer<number | null>(s, null);
  const prev = createLayer<Pos | null>(s, null);
  // Dijkstra sencillo: los costes son pequeños (1 a 3) y el alcance tambien.
  const cheapest = createLayer(s, Infinity);
  cheapest.set(rules.origin, 0);
  const open: Pos[] = [rules.origin];
  for (let current = takeCheapest(open, cheapest); current; current = takeCheapest(open, cheapest)) {
    const spent = cheapest.at(current);
    for (const next of neighbors4(cheapest, current)) {
      if (!stepAllowed(rules, { from: current, to: next, spent })) continue;
      const cost = spent + rules.profile.enterCost(next);
      if (cost >= cheapest.at(next)) continue;
      if (cheapest.at(next) === Infinity) open.push(next);
      cheapest.set(next, cost);
      prev.set(next, current);
      // Por una casilla con un aliado se pasa, pero no se puede terminar en ella.
      steps.set(next, rules.tiles.at(next) === 'passThrough' ? null : cost);
    }
  }
  return { ...rules, steps, prev };
}

/** Se puede terminar el movimiento en `pos` con este alcance. */
export function canReach(range: MoveRange, pos: Pos): boolean {
  return range.steps.contains(pos) && range.steps.at(pos) !== null;
}

/** Casillas a las que se puede mover (sin contar la de salida). */
export function reachableTiles(range: MoveRange): Pos[] {
  return reachableTilesWithCost(range).map((tile) => tile.pos);
}

/** Una casilla del alcance y los pasos que cuesta llegar. */
export interface ReachableTile {
  pos: Pos;
  cost: number;
}

/** Las casillas del alcance con lo que cuesta llegar a cada una, columna a columna. */
export function reachableTilesWithCost(range: MoveRange): ReachableTile[] {
  const tiles: ReachableTile[] = [];
  for (const { pos, value: cost } of range.steps.cells()) if (cost !== null) tiles.push({ pos, cost });
  return tiles;
}

/** Camino desde donde sale hasta `dest` (incluye los dos), siguiendo `prev` hacia atras. */
export function pathTo(range: MoveRange, dest: Pos): Pos[] {
  const path: Pos[] = [];
  for (let step: Pos | null = dest; step && !samePos(step, range.origin); step = range.prev.at(step)) path.unshift(posOf(step));
  path.unshift(posOf(range.origin));
  return path;
}

/**
 * Un camino trazado a mano es valido si empieza donde sale, cada paso vale (`stepAllowed`), no
 * repite casillas y termina en una del alcance.
 */
export function validPath(range: MoveRange, path: readonly Pos[]): boolean {
  const [start, ...rest] = path;
  const end = rest.at(-1);
  if (!start || !end || !samePos(start, range.origin) || !canReach(range, end)) return false;
  return allStepsAllowed(range, path) && new Set(path.map(posKey)).size === path.length;
}

/** Cada paso del camino vale, gastando lo de los anteriores. */
function allStepsAllowed(rules: MoveRules, path: readonly Pos[]): boolean {
  let spent = 0;
  for (const [index, to] of path.entries()) {
    const from = path[index - 1];
    if (!from) continue;
    if (!stepAllowed(rules, { from, to, spent })) return false;
    spent += rules.profile.enterCost(to);
  }
  return true;
}

/**
 * Distancia en pasos desde `from` a cada casilla para un tipo de movimiento, sin limite
 * (Auxiliar.getGroundRange). 0 = inalcanzable (o la propia casilla de origen). El origen no tiene
 * que ser transitable. Las unidades bloquean salvo que se pase `occ` vacio.
 */
export function groundDistance(s: GameState, from: Pos, moveType: MoveType, occ = occupancy(s)): Grid<number> {
  const board = mapGrid(s);
  const distance = board.createLayer(0);
  const seen = board.createLayer(false);
  seen.set(from, true);
  // Busqueda en anchura: cada vuelta avanza un paso desde todo lo alcanzado en la anterior.
  let frontier: Pos[] = [from];
  for (let step = 1; frontier.length; step++) {
    const next: Pos[] = [];
    for (const tile of frontier.flatMap((pos) => neighbors4(board, pos))) {
      if (seen.at(tile) || !isWalkable(s, tile, moveType, occ)) continue;
      seen.set(tile, true);
      distance.set(tile, step);
      next.push(tile);
    }
    frontier = next;
  }
  return distance;
}

/** Pasos que faltan hasta un destino desde cada casilla. */
export interface DistanceMap {
  /** Pasos desde `pos` hasta el destino: 0 en el propio destino, Infinity si no se llega nunca. */
  at(pos: Pos): number;
}

/** Distancias hasta `goal` para un tipo de movimiento, como si no hubiera unidades en medio. */
export function distancesIgnoringUnits(s: GameState, goal: Pos, movement: MoveType): DistanceMap {
  const steps = groundDistance(s, goal, movement, createLayer(s, false));
  // groundDistance marca con 0 tanto el destino como lo que no se alcanza.
  return { at: (pos) => (samePos(pos, goal) ? 0 : steps.at(pos) || Infinity) };
}

/**
 * Casilla del alcance que mas acerca a `goal` (por tierra, mar o aire segun la unidad), sin contar a
 * las demas unidades. A igual distancia, la que menos pasos gasta.
 * null si no se puede llegar nunca o ninguna casilla acerca mas que quedarse donde esta.
 */
export function stepToward(s: GameState, unit: Unit, goal: Pos, range = moveRange(s, unit)): Pos | null {
  const movement = movementOf(s, unit);
  if (!canWalk(s, goal, movement)) return null;

  const distanceToGoal = distancesIgnoringUnits(s, goal, movement);
  const best = minBy(reachableTilesWithCost(range), (tile) => [distanceToGoal.at(tile.pos), tile.cost]);

  const getsCloser = best !== null && distanceToGoal.at(best.pos) < distanceToGoal.at(unit);
  return getsCloser ? best.pos : null;
}

/** El camino trazado por el jugador, si acaba en `dest` y es valido; si no, null. */
function drawnPath(range: MoveRange, dest: Pos, drawn?: readonly Pos[]): Pos[] | null {
  const end = drawn?.at(-1);
  if (!drawn || !end || !samePos(end, dest) || !validPath(range, drawn)) return null;
  return drawn.map((step) => posOf(step));
}

/**
 * Por donde iria la unidad hasta `dest` este turno (Ilogic.Move): el camino trazado `drawn`, si acaba
 * alli y es valido, o si no el mas corto. null si no puede: ya se ha movido, es su casilla o no llega.
 * Calcula el alcance desde la partida (el que tenga guardado quien pregunta no cuenta).
 */
export function plannedPath(s: GameState, unit: Unit, dest: Pos, drawn?: readonly Pos[]): Pos[] | null {
  if (!canStillMove(unit) || samePos(unit, dest)) return null;
  const range = moveRange(s, unit);
  if (!canReach(range, dest)) return null;
  return drawnPath(range, dest, drawn) ?? pathTo(range, dest);
}

/**
 * Para unir o subir a un transporte la unidad tiene que estar al lado del objetivo o poder llegar a
 * una casilla vecina y entrar desde alli (`stepAllowed`, como `join`). Devuelve el camino hasta la
 * casilla vecina mas barata (la propia casilla si ya esta al lado) o null.
 * [CAMBIO] en el original la union y la carga se hacian "a distancia" sin mover a la unidad.
 */
export function approachPath(unit: Unit, target: Pos, range: MoveRange): Pos[] | null {
  if (manhattan(range.origin, target) === 1) return [posOf(range.origin)];
  if (!canStillMove(unit)) return null;
  const canJoinFrom = (tile: ReachableTile) => stepAllowed(range, { from: tile.pos, to: target, spent: tile.cost }, 'join');
  const best = minBy(neighborsInReach(range, target).filter(canJoinFrom), (tile) => tile.cost);
  return best ? pathTo(range, best.pos) : null;
}

/** Las casillas vecinas de `pos` en las que puede acabar, con lo que cuesta llegar. */
function neighborsInReach(range: MoveRange, pos: Pos): ReachableTile[] {
  return neighbors4(range.steps, pos).flatMap((neighbor) => {
    const cost = range.steps.at(neighbor);
    return cost === null ? [] : [{ pos: neighbor, cost }];
  });
}
