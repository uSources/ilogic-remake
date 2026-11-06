/**
 * Lo que hace la IA con una unidad cuando decide ella (sin orden): ir a capturar, avanzar y moverse
 * al azar. Cada paso devuelve true si ha usado la unidad. Retirarse, atacar y capturar lo de debajo
 * son de autopilot/tactics.ts (los usan tambien las ordenes permanentes, que no son de la IA).
 */

import { areAllied, isAlliedOwner, isHostile, isHostileOwner } from '../teams';
import { unitTypeOf, isHq, weightsOf } from '../gameContent';
import { diamond, samePos } from '../geom';
import { mapGrid } from '../mapGrid';
import { canDamage } from '../rules/combat';
import { isContested } from '../rules/control';
import { reachableTiles, type MoveRange } from '../rules/movement';
import { buildingAt, unitAt } from '../rules/queries';
import { visibility } from '../rules/visibility';
import type { Building, ControlPoint, GameEvent, GameState, Pos, Rng, Unit } from '../model';
import { minBy } from '../util/pick';
import { bestMoveToward, doMove, finish, stepsFrom, type PlayCtx } from '../autopilot/context';
import { captureHere } from '../autopilot/tactics';

/** La Base enemiga vale mas que otro edificio: al buscar que capturar, cuenta como si estuviera estos pasos mas cerca. */
const HQ_CAPTURE_HEAD_START = 4;

// ---------------------------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------------------------

/** El edificio ajeno a la vista (hasta AI.MAXCAPTDIST) mas cercano por tierra, con la Base enemiga por delante. */
function captureGoal(s: GameState, ai: PlayCtx, unit: Unit): Pos | null {
  const visible = visibility(s, ai.me);
  const steps = stepsFrom(s, ai, unit);
  const isCapturable = (tile: Pos): boolean => {
    const building = buildingAt(s, tile);
    if (!building || isAlliedOwner(s, building.owner, ai.me) || !visible.at(tile)) return false;
    const occupant = unitAt(s, tile);
    if (occupant && areAllied(s, occupant.team, ai.me)) return false;
    return steps(tile) < Infinity;
  };
  const headStart = (tile: Pos): number => (isHq(s, buildingAt(s, tile)!) ? HQ_CAPTURE_HEAD_START : 0);
  const candidates = [...diamond(mapGrid(s), unit, 1, weightsOf(s).MAXCAPTDIST)].filter(isCapturable);
  return minBy(candidates, (tile) => steps(tile) - headStart(tile));
}

/** Capturar lo de debajo o ir a capturar el edificio ajeno mas cercano (solo las que capturan). */
export function* tryCapture(s: GameState, ai: PlayCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (!unitTypeOf(s, unit).canCapture) return false;
  if (yield* captureHere(s, ai, unit)) return true;
  const goal = captureGoal(s, ai, unit);
  if (!goal) return false;
  yield* doMove(s, ai, unit, bestMoveToward(s, ai, unit, goal, range));
  if (!(yield* captureHere(s, ai, unit))) yield* finish(s, ai, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Avanzar
// ---------------------------------------------------------------------------------------------

/**
 * Cuantos pasos "de ventaja" tiene un objetivo de avance: los que interesan mas cuentan como si
 * estuvieran mas cerca.
 */
function advanceHeadStart(s: GameState, unit: Unit, goal: Pos): number {
  // [CAMBIO] Puntos de control que no son suyos: cuentan como si estuvieran mas cerca.
  if (s.controlPoints?.some((point) => samePos(point, goal))) return weightsOf(s).CONTROLPOINT;
  const building = buildingAt(s, goal);
  if (!building || !unitTypeOf(s, unit).canCapture || building.owner === null) return 0;
  return isHq(s, building) ? weightsOf(s).CAPTUREHQ : weightsOf(s).CAPTUREOWNED;
}

/**
 * A donde puede avanzar: las que capturan, a edificios ajenos; las demas, a enemigos visibles a
 * los que puedan danar y a la Base enemiga. Todas, a puntos de control que no son suyos o que
 * estan disputados (sus zonas: ver controlRound) y libres.
 */
function advanceGoals(s: GameState, ai: PlayCtx, unit: Unit): Pos[] {
  const visible = visibility(s, ai.me);
  const isOpenPoint = (point: ControlPoint): boolean =>
    (!isAlliedOwner(s, point.owner, ai.me) || isContested(s, point)) && !unitAt(s, point);
  const points: Pos[] = (s.controlPoints ?? []).filter(isOpenPoint);
  if (unitTypeOf(s, unit).canCapture) return [...s.buildings.filter((building) => !isAlliedOwner(s, building.owner, ai.me)), ...points];
  const isVisibleTarget = (other: Unit): boolean =>
    isHostile(s, other.team, ai.me) && other.carrier === null && visible.at(other) && canDamage(s, unit, other);
  const isEnemyHq = (building: Building): boolean => isHostileOwner(s, building.owner, ai.me) && isHq(s, building);
  return [...s.units.filter(isVisibleTarget), ...s.buildings.filter(isEnemyHq), ...points];
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
export function* advance(s: GameState, ai: PlayCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  const steps = stepsFrom(s, ai, unit);
  const reachableGoals = advanceGoals(s, ai, unit)
    .map((goal) => ({ goal, steps: stepsToGoalOrNextToIt(s, steps, goal) }))
    .filter((option) => option.steps < Infinity);
  const nearest = minBy(reachableGoals, (option) => option.steps - advanceHeadStart(s, unit, option.goal));
  if (!nearest) return false;
  const goal = nearest.goal;
  // [CAMBIO] Una unidad que no captura no se queda encima de la Base enemiga (taparia a los que si).
  const wouldBlock = !unitTypeOf(s, unit).canCapture && !!buildingAt(s, goal);
  const destination = bestMoveToward(s, ai, unit, goal, range, wouldBlock);
  if (!destination) return false;
  yield* doMove(s, ai, unit, destination);
  yield* finish(s, ai, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Moverse al azar
// ---------------------------------------------------------------------------------------------

/** [CAMBIO] eleccion uniforme (el original nunca elegia la ultima casilla). */
export function* randomMove(s: GameState, ai: PlayCtx, unit: Unit, range: MoveRange, rng: Rng): Generator<GameEvent> {
  const options = reachableTiles(range);
  if (options.length) yield* doMove(s, ai, unit, options[Math.floor(rng() * options.length)]!);
  yield* finish(s, ai, unit);
}
