/**
 * Movimiento y caminos: las reglas de cada paso (`stepAllowed`), el alcance de cada unidad, los
 * caminos trazados y el paso hacia un destino. Como se mueve cada tipo esta en movementProfile.ts, lo
 * que hacen las demas unidades en passage.ts y recorrer un camino de verdad en traverse.ts.
 */
import { manhattan, neighbors4, posKey, samePos, posOf } from '../geom';
import { createLayer } from '../mapGrid';
import type { Grid } from '../util/grid';
import { compareKeys, minBy, type SortKey } from '../util/pick';
import type { MoveType } from '../content';
import type { GameState, Pos, Unit } from '../model';
import { distanceMap } from './distance';
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
 * subir a un transporte). Al entrar en una unidad no se mira si su terreno es de su tipo ni si esa
 * unidad cierra el paso, pero se gasta lo mismo que al entrar en su casilla (`enterCost`).
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
  // Andando o entrando en una unidad (`join`), cuesta lo que la casilla de destino.
  return step.spent + rules.profile.enterCost(step.to) <= rules.profile.budget;
}

/** Saca de `open` la casilla mas barata de llegar (la primera si empatan) y la devuelve. */
function takeCheapest(open: Pos[], cheapest: Grid<number>): Pos | null {
  const best = minBy(open, (pos) => cheapest.at(pos));
  if (best) open.splice(open.indexOf(best), 1);
  return best;
}

/** El alcance a medio calcular: lo mas barato hasta cada casilla y las que quedan por mirar. */
interface RangeSearch {
  readonly rules: MoveRules;
  readonly cheapest: Grid<number>;
  readonly steps: Grid<number | null>;
  readonly prev: Grid<Pos | null>;
  readonly open: Pos[];
}

/** Mira cada vecina de `current`: si se llega mas barato por aqui, lo apunta (y la mira despues si es nueva). */
function expandFrom(search: RangeSearch, current: Pos): void {
  const { rules, cheapest } = search;
  const spent = cheapest.at(current);
  for (const next of neighbors4(cheapest, current)) {
    if (!stepAllowed(rules, { from: current, to: next, spent })) continue;
    const cost = spent + rules.profile.enterCost(next);
    if (cost >= cheapest.at(next)) continue;
    if (cheapest.at(next) === Infinity) search.open.push(next);
    cheapest.set(next, cost);
    search.prev.set(next, current);
    // Por una casilla con un aliado se pasa, pero no se puede terminar en ella.
    search.steps.set(next, rules.tiles.at(next) === 'passThrough' ? null : cost);
  }
}

/**
 * Alcance de movimiento de la unidad desde donde esta: `steps` es lo que cuesta llegar a cada casilla
 * en la que se puede terminar, `prev` el camino mas barato. No mira si ya se ha movido este turno:
 * es hasta donde llegaria en su turno.
 */
export function moveRange(s: GameState, unit: Unit): MoveRange {
  const rules = moveRulesOf(s, unit);
  const search: RangeSearch = {
    rules,
    cheapest: createLayer(s, Infinity),
    steps: createLayer<number | null>(s, null),
    prev: createLayer<Pos | null>(s, null),
    open: [rules.origin],
  };
  search.cheapest.set(rules.origin, 0);
  // Dijkstra sencillo: los costes son pequeños (1 a 3) y el alcance tambien.
  for (let current = takeCheapest(search.open, search.cheapest); current; current = takeCheapest(search.open, search.cheapest))
    expandFrom(search, current);
  return { ...rules, steps: search.steps, prev: search.prev };
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
 * Como elegir la casilla del alcance con la que acercarse a algo: lo que se quiere hacer pequeño en
 * cada casilla (lo que falta y, si empata, los desempates) y en cuales vale acabar.
 */
export interface Approach {
  score(tile: ReachableTile): SortKey;
  /** Si no se dice, vale cualquier casilla del alcance. */
  readonly allows?: (pos: Pos) => boolean;
}

/**
 * La unica forma de dar un paso hacia algo (viajes, mover en grupo, la IA y las formaciones): la
 * casilla del alcance con menos `score` (a igualdad, la primera, columna a columna), si mejora la de
 * quedarse donde esta (coste 0). null si ninguna la mejora.
 */
export function stepToward(range: MoveRange, approach: Approach): Pos | null {
  const allowed = reachableTilesWithCost(range).filter((tile) => approach.allows?.(tile.pos) ?? true);
  const best = minBy(allowed, (tile) => approach.score(tile));
  const stay: ReachableTile = { pos: posOf(range.origin), cost: 0 };
  return best && compareKeys(approach.score(best), approach.score(stay)) < 0 ? best.pos : null;
}

/** Acercarse a `goal` por tierra (mar o aire segun `movement`), sin contar a las demas unidades; a igual distancia, gastando menos. */
export function overGroundTo(s: GameState, movement: MoveType, goal: Pos): Approach {
  const distanceToGoal = distanceMap(s, goal, movement);
  return { score: (tile) => [distanceToGoal.at(tile.pos), tile.cost] };
}

/** Acercarse a `goal` en linea (sin mirar el terreno); a igual distancia, gastando menos. */
export function straightTo(goal: Pos): Approach {
  return { score: (tile) => [manhattan(tile.pos, goal), tile.cost] };
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
 * Para unir o subir a un transporte hay que estar al lado del objetivo o llegar dentro del alcance a
 * una casilla vecina y entrar desde alli (`stepAllowed`, como `join`). Devuelve el camino hasta la
 * casilla vecina mas barata (la de salida si ya esta al lado) o null. Si la unidad aun puede
 * moverse lo mira quien llama (transport.ts).
 * [CAMBIO] en el original la union y la carga se hacian "a distancia" sin mover a la unidad.
 */
export function approachPath(range: MoveRange, target: Pos): Pos[] | null {
  // Ya al lado no es un paso del movimiento: no gasta ni mira lo que podria gastar (vale aunque ya
  // se haya movido o el clima no le deje moverse, como la union "a distancia" de 2013, y desde
  // dentro de una zona de control). Desde mas lejos, entrar es el ultimo paso y paga como tal.
  if (manhattan(range.origin, target) === 1) return [posOf(range.origin)];
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
