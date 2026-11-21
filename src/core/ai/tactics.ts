/**
 * Lo que hace la IA con una unidad cuando decide ella (sin orden): ir a capturar, avanzar y moverse
 * al azar. Cada paso devuelve true si ha usado la unidad. Retirarse, atacar y capturar lo de debajo
 * son de autopilot/tactics.ts (los usan tambien las ordenes permanentes, que no son de la IA).
 */

import { areAllied, isAlliedOwner } from '../teams';
import { isHq } from '../gameContent';
import { diamond, manhattan, samePos } from '../geom';
import { mapGrid } from '../mapGrid';
import { canDamage } from '../rules/weapons';
import { isContested } from '../rules/control';
import { moveRange, reachableTiles, stepToward, type MoveRange } from '../rules/movement';
import { buildingAt, isEnemyHq, unitAt } from '../rules/queries';
import { knownFoes, sightIn } from '../playerView';
import type { ActionPlan, Building, ControlPoint, GameState, Pos, Rng, Unit } from '../model';
import { minBy } from '../util/pick';
import { pick } from '../util/random';
import { bestMoveToward, doMove, finish, stepsMap, type PlayCtx } from '../autopilot/context';
import { captureHere, tryAttack } from '../autopilot/tactics';
import { SHOOT_FROM_HERE } from '../autopilot/engagement';
import { effectiveStandingOrder } from '../squads/standingOrderQueries';
import { isCapturer } from '../util/predicates';

// ---------------------------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------------------------

/** El edificio ajeno a la vista (hasta profile.weights.maxCaptureDistance) mas cercano por tierra, con la Base enemiga por delante. */
function captureGoal(s: GameState, play: PlayCtx, unit: Unit): Pos | null {
  const sees = sightIn(s, play.me);
  // Desde 1 casilla: lo de debajo ya lo ha mirado captureHere.
  const steps = stepsMap(s, play, unit);
  const capturableAt = (tile: Pos): Building | null => {
    const building = buildingAt(s, tile);
    if (!building || isAlliedOwner(s, building.owner, play.me) || !sees(tile)) return null;
    const occupant = unitAt(s, tile);
    if (occupant && areAllied(s, occupant.team, play.me)) return null;
    return steps.at(tile) < Infinity ? building : null;
  };
  const candidates = [...diamond(mapGrid(s), unit, 1, play.profile.weights.maxCaptureDistance)].flatMap((tile) => {
    const building = capturableAt(tile);
    return building ? [{ tile, building }] : [];
  });
  const headStart = (building: Building): number => (isHq(s, building) ? play.profile.weights.hqCaptureHeadStart : 0);
  return minBy(candidates, (candidate) => steps.at(candidate.tile) - headStart(candidate.building))?.tile ?? null;
}

/** Capturar lo de debajo o ir a capturar el edificio ajeno mas cercano (solo las que capturan). */
export function* tryCapture(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  if (!isCapturer(s, unit)) return false;
  if (yield* captureHere(s, unit)) return true;
  const goal = captureGoal(s, play, unit);
  if (!goal) return false;
  yield* doMove(unit, bestMoveToward(s, play, unit, goal, range));
  if (!(yield* captureHere(s, unit))) yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Avanzar
// ---------------------------------------------------------------------------------------------

/**
 * Cuantos pasos "de ventaja" tiene un objetivo de avance: los que interesan mas cuentan como si
 * estuvieran mas cerca.
 */
function advanceHeadStart(s: GameState, play: PlayCtx, unit: Unit, goal: Pos): number {
  // [CAMBIO] Puntos de control que no son suyos: cuentan como si estuvieran mas cerca.
  if (s.controlPoints?.some((point) => samePos(point, goal))) return play.profile.weights.controlPointHeadStart;
  const building = buildingAt(s, goal);
  if (!building || !isCapturer(s, unit) || building.owner === null) return 0;
  return isHq(s, building) ? play.profile.weights.enemyHqPreference : play.profile.weights.ownedBuildingPreference;
}

/**
 * A donde puede avanzar: las que capturan, a edificios ajenos; las demas, a enemigos visibles a
 * los que puedan danar y a la Base enemiga. Todas, a puntos de control que no son suyos o que
 * estan disputados (sus zonas: ver controlRound) y libres.
 */
function advanceGoals(s: GameState, play: PlayCtx, unit: Unit): Pos[] {
  const isOpenPoint = (point: ControlPoint): boolean =>
    (!isAlliedOwner(s, point.owner, play.me) || isContested(s, point)) && !unitAt(s, point);
  const points: Pos[] = (s.controlPoints ?? []).filter(isOpenPoint);
  if (isCapturer(s, unit)) return [...s.buildings.filter((building) => !isAlliedOwner(s, building.owner, play.me)), ...points];
  const targets = knownFoes(s, play.me).filter((foe) => canDamage(s, unit, foe));
  return [...targets, ...s.buildings.filter((building) => isEnemyHq(s, building, play.me)), ...points];
}

/** Pasos hasta `goal` o, si no se puede llegar a esa casilla (ocupada), hasta su vecina mas cercana. */
function stepsToGoalOrNextToIt(s: GameState, steps: (pos: Pos) => number, goal: Pos): number {
  const toGoal = steps(goal);
  if (toGoal < Infinity) return toGoal;
  return Math.min(...[...diamond(mapGrid(s), goal, 1, 1)].map(steps));
}

/**
 * Avanzar: las que capturan van al edificio ajeno mas cercano; las demas, hacia la unidad del
 * jugador mas cercana o, si no hay, hacia su Base.
 * [CAMBIO] en el original este paso casi nunca se activaba y la IA paseaba al azar.
 */
export function* advance(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  const fromHere = stepsMap(s, play, unit);
  // La casilla en la que ya esta no cuenta como sitio al que ir (ni como vecina del objetivo).
  const steps = (pos: Pos) => (samePos(pos, unit) ? Infinity : fromHere.at(pos));
  const reachableGoals = advanceGoals(s, play, unit)
    .map((goal) => ({ goal, steps: stepsToGoalOrNextToIt(s, steps, goal) }))
    .filter((option) => option.steps < Infinity);
  const nearest = minBy(reachableGoals, (option) => option.steps - advanceHeadStart(s, play, unit, option.goal));
  if (!nearest) return false;
  const goal = nearest.goal;
  // [CAMBIO] Una unidad que no captura no se queda encima de la Base enemiga (taparia a los que si).
  const wouldBlock = !isCapturer(s, unit) && !!buildingAt(s, goal);
  const destination = bestMoveToward(s, play, unit, goal, range, wouldBlock);
  if (!destination) return false;
  yield* doMove(unit, destination);
  yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Seguir el plan
// ---------------------------------------------------------------------------------------------

/**
 * Ir hacia el objetivo de su plan (plans.ts: su orden permanente, que la IA lee como destino):
 * capturar su edificio o acercarse a su zona de ataque o defensa, disparando desde donde llegue a lo
 * que tenga a tiro. Ya en la zona (a 1 casilla o menos), o sin plan, no hace nada: alli pelea con lo
 * de siempre.
 */
export function* followPlan(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  const order = effectiveStandingOrder(s, unit);
  if (!order) return false;
  if (order.kind === 'capture') return yield* captureAt(s, play, unit, range, order.at);
  if (manhattan(unit, order.at) <= 1) return false;
  // Sin quedarse encima de un edificio (taparia a las que capturan).
  const destination = bestMoveToward(s, play, unit, order.at, range, !!buildingAt(s, order.at));
  if (!destination) return false;
  const interrupted = yield* doMove(unit, destination);
  if (!interrupted && !(yield* tryAttack(s, play, unit, moveRange(s, unit), SHOOT_FROM_HERE))) yield* finish(s, unit);
  return true;
}

/** Capturar el edificio de `at`: si esta encima, capturarlo; si no, acercarse y capturarlo si llega. */
function* captureAt(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange, at: Pos): ActionPlan<boolean> {
  if (samePos(unit, at)) return yield* captureHere(s, unit);
  const destination = bestMoveToward(s, play, unit, at, range);
  if (!destination) return false;
  yield* doMove(unit, destination);
  if (!(yield* captureHere(s, unit))) yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Ponerse a cubierto
// ---------------------------------------------------------------------------------------------

/**
 * Si donde esta le pueden quitar casi toda la vida (`coverDangerShare` de la que tiene) y la zona es
 * del enemigo, irse a la casilla del alcance con menos peligro (a igualdad, la que menos gasta). Sin
 * mapas de influencia o sin peligro, no hace nada.
 */
export function* takeCover(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  const influence = play.influence;
  if (!influence || influence.control(unit) >= 0) return false;
  const danger = (pos: Pos) => influence.dangerFor(unit, pos);
  if (danger(unit) < unit.life * play.profile.weights.coverDangerShare) return false;
  const shelter = stepToward(range, { score: (tile) => [danger(tile.pos), tile.cost] });
  if (!shelter) return false;
  yield* doMove(unit, shelter);
  yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Ir al frente
// ---------------------------------------------------------------------------------------------

/**
 * Sin nada mejor que hacer, ir a la casilla del frente mas cercana (mapas de influencia: la linea entre
 * los dos ejercitos) en vez de pasear: alli hace falta y no se queda sola en casa. Sin mapas o sin
 * frente (ningun enemigo a la vista), no hace nada.
 */
export function* holdFront(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  const front = play.influence?.front ?? [];
  if (!front.length) return false;
  const steps = stepsMap(s, play, unit);
  const nearest = minBy(
    front.filter((pos) => steps.at(pos) < Infinity),
    (pos) => steps.at(pos),
  );
  if (!nearest) return false;
  const destination = samePos(nearest, unit) ? null : bestMoveToward(s, play, unit, nearest, range);
  yield* doMove(unit, destination);
  yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Moverse al azar
// ---------------------------------------------------------------------------------------------

/** [CAMBIO] eleccion uniforme (el original nunca elegia la ultima casilla). */
export function* randomMove(s: GameState, unit: Unit, range: MoveRange, rng: Rng): ActionPlan {
  const destination = pick(reachableTiles(range), rng);
  if (destination) yield* doMove(unit, destination);
  yield* finish(s, unit);
}
