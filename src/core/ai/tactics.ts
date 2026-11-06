/**
 * Lo que puede hacer la IA con una unidad, paso a paso: retirarse a curarse, atacar (o acercarse),
 * capturar, avanzar y moverse al azar. Cada paso devuelve true si ha usado la unidad.
 * Los usan el turno de la IA (unitTurn) y las ordenes con destino (standingOrderTurn).
 */

import { areAllied, isAlliedOwner, isHostile, isHostileOwner } from '../teams';
import { unitTypeOf, isHq, weightsOf } from '../gameContent';
import { diamond, manhattan, samePos } from '../geom';
import { mapGrid } from '../mapGrid';
import { canCapture } from '../rules/capture';
import { canDamage, fireOrigins, inAttackRange } from '../rules/combat';
import { isContested } from '../rules/control';
import { reachableTiles, type MoveRange } from '../rules/movement';
import { buildingAt, unitAt } from '../rules/queries';
import { mergeTargets } from '../rules/transport';
import { canStillFire } from '../rules/unitTurn';
import { visibility } from '../rules/visibility';
import type { Building, ControlPoint, GameEvent, GameState, Pos, Rng, Unit } from '../model';
import { maxBy, minBy } from '../util/pick';
import { act, bestMoveToward, doMove, finish, repairsHere, stepsFrom, strikeReach, visibleFoes, type AiCtx } from './context';
import { attackScore, unitValue } from './scoring';

/** La Base enemiga vale mas que otro edificio: al buscar que capturar, cuenta como si estuviera estos pasos mas cerca. */
const HQ_CAPTURE_HEAD_START = 4;

// ---------------------------------------------------------------------------------------------
// Retirarse
// ---------------------------------------------------------------------------------------------

/** Unirse a la unidad igual mas cercana si la suma de vidas no pasa de AI.MAXMERGELIFE. */
function* mergeWithMate(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  const mates = mergeTargets(s, unit, range).filter((mate) => mate.life + unit.life <= weightsOf(s).MAXMERGELIFE);
  const nearest = minBy(mates, (mate) => manhattan(unit, mate));
  if (!nearest) return false;
  return yield* act(s, ai, { kind: 'merge', uid: unit.uid, into: nearest.uid });
}

/** El edificio propio libre que la repara al que menos pasos hay (null si no llega a ninguno). */
function nearestRepairBuilding(s: GameState, ai: AiCtx, unit: Unit): Building | null {
  const steps = stepsFrom(s, ai, unit);
  const repairShops = s.buildings.filter((building) => repairsHere(s, unit, building) && steps(building) < Infinity);
  return minBy(repairShops, steps);
}

/** Ir a curarse: unirse a otra igual, quedarse si ya esta en un edificio que la repara o ir al mas cercano. */
export function* retreat(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (yield* mergeWithMate(s, ai, unit, range)) return true;
  // [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  if (repairsHere(s, unit, unit)) {
    yield* finish(s, ai, unit);
    return true;
  }
  const repairShop = nearestRepairBuilding(s, ai, unit);
  if (!repairShop) return false;
  yield* doMove(s, ai, unit, bestMoveToward(s, ai, unit, repairShop, range));
  yield* finish(s, ai, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Atacar
// ---------------------------------------------------------------------------------------------

/**
 * Opciones de tryAttack para las ordenes con destino: `zone` limita a que enemigos se mira (defender),
 * `chase: false` no persigue a nadie fuera de tiro y `stay` solo dispara desde donde esta.
 */
export interface AttackOpts {
  zone?: (unit: Unit) => boolean;
  chase?: boolean;
  stay?: boolean;
  /** Casillas desde las que puede disparar si se mueve (formacion: sin adelantarse a su escuadra). */
  from?: (pos: Pos) => boolean;
}

/** Un disparo posible: desde donde, a quien y cuanto vale. */
interface Shot {
  from: Pos;
  target: Unit;
  score: number;
}

/** Valor de un disparo, con el extra si el objetivo es el que remata entre varias este turno. */
function shotScore(s: GameState, ai: AiCtx, unit: Unit, target: Unit, from: Pos): number {
  const score = attackScore(s, ai, unit, target, from);
  // [CAMBIO] Fuego concentrado: el objetivo del plan del turno vale mas (lo rematan entre varias).
  const isPlannedTarget = ai.group && ai.plan.get(unit.uid) === target.uid;
  return isPlannedTarget ? score + weightsOf(s).FOCUSFIRE * unitValue(s, target) : score;
}

/**
 * El disparo que mas vale entre todos los (objetivo, casilla desde la que dispara), si alguno vale algo.
 * Las unidades a distancia no pueden mover y disparar (fireOrigins solo les da su casilla). A
 * igualdad gana el primero: no moverse o la casilla con mas defensa (el orden de fireOrigins).
 */
function bestShot(s: GameState, ai: AiCtx, unit: Unit, enemies: Unit[], origins: Pos[]): Shot | null {
  const shots = enemies.flatMap((target) =>
    origins
      .filter((from) => inAttackRange(s, unit, from, target))
      .map((from) => ({ from, target, score: shotScore(s, ai, unit, target, from) })),
  );
  return maxBy(
    shots.filter((shot) => shot.score > 0),
    (shot) => shot.score,
  );
}

/** Nadie a tiro este turno: acercarse al enemigo visible mas cercano al que pueda danar. */
function* chaseNearest(s: GameState, ai: AiCtx, unit: Unit, enemies: Unit[], range: MoveRange): Generator<GameEvent, boolean> {
  const prey = minBy(
    enemies.filter((enemy) => canDamage(s, unit, enemy)),
    (enemy) => manhattan(unit, enemy),
  );
  if (!prey) return false;
  yield* doMove(s, ai, unit, bestMoveToward(s, ai, unit, prey, range));
  yield* finish(s, ai, unit);
  return true;
}

/** Atacar al mejor objetivo a tiro o, si no hay, acercarse al mas cercano (ver AttackOpts). */
export function* tryAttack(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange, options: AttackOpts = {}): Generator<GameEvent, boolean> {
  const { zone, chase = true, stay = false, from: allowedOrigin } = options;
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (!(unitTypeOf(s, unit).attack !== null) || !canStillFire(s, unit)) return false;
  const reach = strikeReach(s, unit);
  const isInReach = (enemy: Unit) => manhattan(unit, enemy) <= reach && (!zone || zone(enemy));
  // Solo a los que puede hacer daño: un ataque que no quita vida no vale (ver attackProblem).
  const enemies = visibleFoes(s, ai.me).filter((enemy) => isInReach(enemy) && canDamage(s, unit, enemy));
  if (!enemies.length) return false;

  const shot = bestShot(s, ai, unit, enemies, fireOrigins(s, unit, stay ? null : range, allowedOrigin));
  if (shot) {
    const ambushed = yield* doMove(s, ai, unit, samePos(shot.from, unit) ? null : shot.from);
    // Desde la casilla nueva puede no verlo ya (el bosque solo se ve desde al lado): entonces espera.
    const attacked = !ambushed && (yield* act(s, ai, { kind: 'attack', uid: unit.uid, target: shot.target.uid }));
    if (!attacked) yield* finish(s, ai, unit);
    return true;
  }
  if (!chase) return false;
  return yield* chaseNearest(s, ai, unit, enemies, range);
}

// ---------------------------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------------------------

/** Capturar el edificio de debajo y avisar a la interfaz. */
export function* captureHere(s: GameState, ai: AiCtx, unit: Unit): Generator<GameEvent, boolean> {
  if (!canCapture(s, unit)) return false;
  return yield* act(s, ai, { kind: 'capture', uid: unit.uid });
}

/** El edificio ajeno a la vista (hasta AI.MAXCAPTDIST) mas cercano por tierra, con la Base enemiga por delante. */
function captureGoal(s: GameState, ai: AiCtx, unit: Unit): Pos | null {
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
export function* tryCapture(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
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
function advanceGoals(s: GameState, ai: AiCtx, unit: Unit): Pos[] {
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
export function* advance(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
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
export function* randomMove(s: GameState, ai: AiCtx, unit: Unit, range: MoveRange, rng: Rng): Generator<GameEvent> {
  const options = reachableTiles(range);
  if (options.length) yield* doMove(s, ai, unit, options[Math.floor(rng() * options.length)]!);
  yield* finish(s, ai, unit);
}
