/**
 * Movimiento y caminos: alcance de cada unidad, caminos trazados, emboscadas, distancia por tierra
 * y el evento de mover.
 */
import { movementOf, tablesOf, terrainMoveCost } from '../gameContent';
import { type MoveType } from '../data';
import { isRanged, zoneOfControl } from '../abilities';
import { manhattan, neighbors4, posKey, samePos, posOf } from '../geom';
import { createLayer, mapGrid, terrainAt } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isEnemyOf, isOnMap } from '../util/predicates';
import { minBy } from '../util/pick';
import { weatherMove } from '../weather';
import type { GameEvent, GameState, Pos, Unit } from '../model';
import { dropStaleCaptures } from './capture';
import { canWalk, isWalkable, occupancy } from './queries';
import { visibility } from './visibility';

export interface MoveRange {
  /** Pasos para llegar a cada casilla (1..max); 0 = inalcanzable o casilla de origen. */
  steps: Grid<number>;
  /** Casilla previa en el camino mas corto (para animar el recorrido). */
  prev: Grid<Pos | null>;
  maxSteps: number;
}

/**
 * Pasos maximos este turno.
 * [CAMBIO] El clima puede quitar movimiento (nunca por debajo de 1 si la unidad se mueve).
 */
export function maxSteps(s: GameState, unit: Unit): number {
  const base = tablesOf(s).UNIT.mover[unit.type]!;
  if (base <= 0) return base;
  return Math.max(1, base + weatherMove(s, movementOf(s, unit.type)));
}

/** Lo que dice passMap de cada casilla para una unidad. */
export interface PassMap {
  /** No se puede pasar. */
  block: Grid<boolean>;
  /** Hay alguien: se puede pasar (aliados) pero no terminar. */
  taken: Grid<boolean>;
  /** Hay que pararse al entrar (zona de control enemiga). */
  stop: Grid<boolean>;
}

/**
 * Que casillas bloquean el paso a `unit` y en cuales no puede terminar.
 * [CAMBIO] Reglas nuevas: se atraviesan las unidades propias, y los enemigos que el bando de `unit`
 * no ve no cuentan (asi el alcance no delata donde estan; al moverse, emboscada).
 */
export function passMap(s: GameState, unit: Unit): PassMap {
  const block = createLayer(s, false);
  const taken = createLayer(s, false);
  const visible = s.rules.ambush ? visibility(s, unit.team) : null;
  // [CAMBIO] Zona de control (habilidades): casillas en las que hay que pararse.
  const stop = zoneOfControl(s, unit, visible);
  for (const other of s.units) {
    if (!isOnMap(other) || other.uid === unit.uid) continue;
    if (!isEnemyOf(other, unit)) {
      taken.set(other, true);
      if (!s.rules.passAllies) block.set(other, true);
    } else if (!visible || visible.at(other)) {
      taken.set(other, true);
      block.set(other, true);
    }
  }
  return { block, taken, stop };
}

/** Lo que cuesta entrar en una casilla (1 con las reglas clasicas). */
export function moveCost(s: GameState, moveType: MoveType, pos: Pos): number {
  return s.rules.terrainCost ? terrainMoveCost(s, moveType, terrainAt(s, pos)) : 1;
}

/** Coste de recorrer un camino (sin contar la casilla de salida). */
export function pathCost(s: GameState, moveType: MoveType, path: Pos[]): number {
  let cost = 0;
  for (const step of path.slice(1)) cost += moveCost(s, moveType, step);
  return cost;
}

/** Saca de `open` la casilla mas barata de llegar (la primera si empatan) y la devuelve. */
function takeCheapest(open: Pos[], cheapest: Grid<number>): Pos {
  const best = minBy(open, (pos) => cheapest.at(pos))!;
  open.splice(open.indexOf(best), 1);
  return best;
}

/**
 * Alcance de movimiento: `steps` es lo que cuesta llegar a cada casilla en la que se puede terminar
 * (0 si no se llega), `prev` el camino mas barato (tambien por casillas de paso, con aliados).
 */
export function moveRange(s: GameState, unit: Unit): MoveRange {
  const board = mapGrid(s);
  const steps = board.createLayer(0);
  const prev = board.createLayer<Pos | null>(null);
  const max = maxSteps(s, unit);
  const movement = movementOf(s, unit.type);
  const { block, taken, stop } = passMap(s, unit);
  const canEnter = (tile: Pos) => canWalk(s, tile, movement) && !block.at(tile) && !samePos(tile, unit);

  // Dijkstra sencillo: los costes son pequeños (1 a 3) y el alcance tambien.
  const cheapest = board.createLayer(Infinity);
  cheapest.set(unit, 0);
  const open: Pos[] = [posOf(unit)];
  while (open.length) {
    const current = takeCheapest(open, cheapest);
    const costHere = cheapest.at(current);
    for (const next of neighbors4(board, current)) {
      if (!canEnter(next)) continue;
      const cost = costHere + moveCost(s, movement, next);
      if (cost > max || cost >= cheapest.at(next)) continue;
      const isFirstVisit = cheapest.at(next) === Infinity;
      // En una zona de control enemiga se puede entrar, pero no seguir desde ella.
      if (isFirstVisit && !stop.at(next)) open.push(next);
      cheapest.set(next, cost);
      prev.set(next, current);
      // Por una casilla con un aliado se pasa, pero no se puede terminar en ella.
      steps.set(next, taken.at(next) ? 0 : cost);
    }
  }
  return { steps, prev, maxSteps: max };
}

/** Se puede terminar el movimiento en `pos` con este alcance. */
export function canReach(range: MoveRange, pos: Pos): boolean {
  return range.steps.contains(pos) && range.steps.at(pos) > 0;
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
  for (const { pos, value: cost } of range.steps.cells()) if (cost > 0) tiles.push({ pos, cost });
  return tiles;
}

/** Camino de un movimiento; si ha habido emboscada, donde estaba el enemigo escondido. */
export type MovePath = Pos[] & { ambush?: Pos };

/** Hay una unidad del otro bando en la casilla (escondida o no: al pisarla se descubre). */
function enemyAt(s: GameState, unit: Unit, pos: Pos): boolean {
  return s.units.some((other) => isOnMap(other) && isEnemyOf(other, unit) && samePos(other, pos));
}

/** Hay otra unidad (de cualquier bando) en la casilla: ahi no se puede quedar parada. */
function someoneElseAt(s: GameState, unit: Unit, pos: Pos): boolean {
  return s.units.some((other) => isOnMap(other) && other.uid !== unit.uid && samePos(other, pos));
}

/**
 * Recorre un camino comprobando emboscadas: si una casilla tiene un enemigo (escondido), la unidad
 * se para en la ultima casilla libre antes de el. Devuelve el camino recorrido de verdad.
 */
export function walkPath(s: GameState, unit: Unit, path: Pos[]): MovePath {
  const ambushIndex = path.findIndex((pos, index) => index > 0 && enemyAt(s, unit, pos));
  if (ambushIndex < 0) return path;
  // Retrocede por las casillas de paso (con aliados) hasta una en la que se pueda parar.
  let stopIndex = ambushIndex - 1;
  while (stopIndex > 0 && someoneElseAt(s, unit, path[stopIndex]!)) stopIndex--;
  const walked = path.slice(0, stopIndex + 1) as MovePath;
  walked.ambush = { ...path[ambushIndex]! };
  return walked;
}

/**
 * Aplica una emboscada: la unidad acaba en el ultimo punto del camino y pierde el turno.
 * (Interna de las reglas: la usan mover, unir y subir a un transporte.)
 */
export function ambushed(s: GameState, unit: Unit, walked: MovePath): MovePath {
  const end = walked[walked.length - 1]!;
  unit.x = end.x;
  unit.y = end.y;
  unit.active = false;
  unit.canMove = false;
  unit.canFire = false;
  dropStaleCaptures(s);
  return walked;
}

/** Camino desde la unidad hasta `dest` (incluye ambos extremos), siguiendo `prev` hacia atras. */
export function pathTo(range: MoveRange, from: Pos, dest: Pos): Pos[] {
  const path: Pos[] = [];
  let step: Pos | null = dest;
  while (step && !samePos(step, from)) {
    path.unshift(step);
    step = range.prev.at(step);
  }
  path.unshift(posOf(from));
  return path;
}

/**
 * Un camino trazado a mano es valido si empieza en la unidad, va de casilla vecina en vecina por
 * casillas del alcance (o de paso), sin repetir, no supera el movimiento y termina en un destino libre.
 */
export function validPath(s: GameState, unit: Unit, path: Pos[], range: MoveRange): boolean {
  const movement = movementOf(s, unit.type);
  if (path.length < 2 || !samePos(path[0]!, unit) || pathCost(s, movement, path) > range.maxSteps) return false;
  const end = path[path.length - 1]!;
  if (!canReach(range, end)) return false;
  return validSteps(s, unit, path);
}

/** Cada paso del camino es a una vecina por la que se puede pasar, sin volver atras ni pararse antes de tiempo. */
function validSteps(s: GameState, unit: Unit, path: Pos[]): boolean {
  const { block, stop } = passMap(s, unit);
  const movement = movementOf(s, unit.type);
  const visited = new Set<string>();
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    const isLast = i === path.length - 1;
    if (manhattan(from, to) !== 1 || !canWalk(s, to, movement) || block.at(to)) return false;
    // En una zona de control enemiga hay que pararse: solo vale como ultima casilla.
    if (!isLast && stop.at(to)) return false;
    const key = posKey(to);
    if (visited.has(key) || samePos(to, unit)) return false;
    visited.add(key);
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
  const movement = movementOf(s, unit.type);
  if (!canWalk(s, goal, movement)) return null;

  const distanceToGoal = distancesIgnoringUnits(s, goal, movement);
  const best = minBy(reachableTilesWithCost(range), (tile) => [distanceToGoal.at(tile.pos), tile.cost]);

  const getsCloser = best !== null && distanceToGoal.at(best.pos) < distanceToGoal.at(unit);
  return getsCloser ? best.pos : null;
}

/** El camino trazado por el jugador, si acaba en `dest` y es valido; si no, null. */
function drawnPath(s: GameState, unit: Unit, dest: Pos, range: MoveRange, via?: Pos[]): Pos[] | null {
  if (!via || !samePos(via[via.length - 1]!, dest) || !validPath(s, unit, via, range)) return null;
  return via.map((step) => ({ ...step }));
}

/** Mueve la unidad (Ilogic.Move). Devuelve el camino recorrido o null si no es valido. */
export function moveUnit(s: GameState, unit: Unit, dest: Pos, range = moveRange(s, unit), via?: Pos[]): MovePath | null {
  if (!unit.active || !unit.canMove || samePos(unit, dest) || !canReach(range, dest)) return null;
  // `via`: camino trazado por el jugador (si es valido); si no, el mas corto.
  const path = drawnPath(s, unit, dest, range, via) ?? pathTo(range, unit, dest);
  const walked = walkPath(s, unit, path);
  if (walked.ambush) return ambushed(s, unit, walked);
  unit.x = dest.x;
  unit.y = dest.y;
  unit.canMove = false;
  // Las unidades a distancia no pueden mover y disparar en el mismo turno.
  if (isRanged(s, unit.type)) unit.canFire = false;
  dropStaleCaptures(s);
  return path;
}

/**
 * Para unir o subir a un transporte la unidad tiene que poder llegar a una casilla
 * vecina del objetivo y dar un paso mas. Devuelve el camino hasta la casilla vecina
 * (la propia casilla si ya esta al lado) o null.
 * [CAMBIO] en el original la union y la carga se hacian "a distancia" sin mover a la unidad.
 */
export function approachPath(s: GameState, unit: Unit, target: Pos, range = moveRange(s, unit)): Pos[] | null {
  if (!unit.canMove && manhattan(unit, target) !== 1) return null;
  const lastStepCost = moveCost(s, movementOf(s, unit.type), target);
  const stepsTo = (tile: Pos) => (samePos(tile, unit) ? 0 : range.steps.at(tile));
  const canStepInFrom = (tile: Pos) => samePos(tile, unit) || (stepsTo(tile) > 0 && stepsTo(tile) + lastStepCost <= range.maxSteps);

  const best = minBy(neighbors4(range.steps, target).filter(canStepInFrom), stepsTo);
  if (!best) return null;
  return samePos(best, unit) ? [posOf(unit)] : pathTo(range, unit, best);
}

/** Evento de mover (los que anima la escena y cuentan las estadisticas). Un solo sitio para su forma. */
export function moveEvent(uid: number, path: MovePath): GameEvent {
  return path.ambush ? { kind: 'move', uid, path, ambush: path.ambush } : { kind: 'move', uid, path };
}
