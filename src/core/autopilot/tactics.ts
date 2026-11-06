/**
 * Lo que puede hacer una unidad, paso a paso, al cumplir una orden permanente o en el turno de la
 * IA: retirarse a curarse, atacar (o acercarse) y capturar el edificio de debajo. Cada paso devuelve
 * true si ha usado la unidad. Los usan las ordenes (standingOrders.ts, una regla de la partida) y la
 * IA (ai/unitTurn.ts, ai/tactics.ts), que los reutiliza.
 */

import { unitTypeOf, weightsOf } from '../gameContent';
import { manhattan, samePos } from '../geom';
import { canCapture } from '../rules/capture';
import { fireOrigins } from '../rules/combat';
import { canDamage, inAttackRange } from '../rules/weapons';
import type { MoveRange } from '../rules/movement';
import { mergeTargets } from '../rules/transport';
import { canStillFire } from '../rules/unitTurn';
import type { Building, GameEvent, GameState, Pos, Unit } from '../model';
import { maxBy, minBy } from '../util/pick';
import { act, bestMoveToward, doMove, finish, repairsHere, stepsMap, strikeReach, visibleFoes, type PlayCtx } from './context';
import { attackScore, unitValue } from './scoring';

// ---------------------------------------------------------------------------------------------
// Retirarse
// ---------------------------------------------------------------------------------------------

/** Unirse a la unidad igual mas cercana si la suma de vidas no pasa de AI.MAXMERGELIFE. */
function* mergeWithMate(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  const mates = mergeTargets(s, unit, range).filter((mate) => mate.life + unit.life <= weightsOf(s).MAXMERGELIFE);
  const nearest = minBy(mates, (mate) => manhattan(unit, mate));
  if (!nearest) return false;
  return yield* act(s, play, { kind: 'merge', uid: unit.uid, into: nearest.uid });
}

/** El edificio propio libre que la repara al que menos pasos hay (null si no llega a ninguno). */
function nearestRepairBuilding(s: GameState, play: PlayCtx, unit: Unit): Building | null {
  // La casilla en la que esta no sale: si alli la repararan, ya se habria quedado (retreat).
  const steps = stepsMap(s, play, unit);
  const repairShops = s.buildings.filter((building) => repairsHere(s, unit, building) && steps.at(building) < Infinity);
  return minBy(repairShops, (building) => steps.at(building));
}

/** Ir a curarse: unirse a otra igual, quedarse si ya esta en un edificio que la repara o ir al mas cercano. */
export function* retreat(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (yield* mergeWithMate(s, play, unit, range)) return true;
  // [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  if (repairsHere(s, unit, unit)) {
    yield* finish(s, play, unit);
    return true;
  }
  const repairShop = nearestRepairBuilding(s, play, unit);
  if (!repairShop) return false;
  yield* doMove(s, play, unit, bestMoveToward(s, play, unit, repairShop, range));
  yield* finish(s, play, unit);
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
function shotScore(s: GameState, play: PlayCtx, unit: Unit, target: Unit, from: Pos): number {
  const score = attackScore(s, play, unit, target, from);
  // [CAMBIO] Fuego concentrado: el objetivo del plan del turno vale mas (lo rematan entre varias).
  const isPlannedTarget = play.group && play.plan.get(unit.uid) === target.uid;
  return isPlannedTarget ? score + weightsOf(s).FOCUSFIRE * unitValue(s, target) : score;
}

/**
 * El disparo que mas vale entre todos los (objetivo, casilla desde la que dispara), si alguno vale algo.
 * Las unidades a distancia no pueden mover y disparar (fireOrigins solo les da su casilla). A
 * igualdad gana el primero: no moverse o la casilla con mas defensa (el orden de fireOrigins).
 */
function bestShot(s: GameState, play: PlayCtx, unit: Unit, enemies: Unit[], origins: Pos[]): Shot | null {
  const shots = enemies.flatMap((target) =>
    origins
      .filter((from) => inAttackRange(s, unit, from, target))
      .map((from) => ({ from, target, score: shotScore(s, play, unit, target, from) })),
  );
  return maxBy(
    shots.filter((shot) => shot.score > 0),
    (shot) => shot.score,
  );
}

/** Nadie a tiro este turno: acercarse al enemigo visible mas cercano al que pueda danar. */
function* chaseNearest(s: GameState, play: PlayCtx, unit: Unit, enemies: Unit[], range: MoveRange): Generator<GameEvent, boolean> {
  const prey = minBy(
    enemies.filter((enemy) => canDamage(s, unit, enemy)),
    (enemy) => manhattan(unit, enemy),
  );
  if (!prey) return false;
  yield* doMove(s, play, unit, bestMoveToward(s, play, unit, prey, range));
  yield* finish(s, play, unit);
  return true;
}

/** Atacar al mejor objetivo a tiro o, si no hay, acercarse al mas cercano (ver AttackOpts). */
export function* tryAttack(
  s: GameState,
  play: PlayCtx,
  unit: Unit,
  range: MoveRange,
  options: AttackOpts = {},
): Generator<GameEvent, boolean> {
  const { zone, chase = true, stay = false, from: allowedOrigin } = options;
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (unitTypeOf(s, unit).attack === null || !canStillFire(s, unit)) return false;
  const reach = strikeReach(s, unit);
  const isInReach = (enemy: Unit) => manhattan(unit, enemy) <= reach && (!zone || zone(enemy));
  // Solo a los que puede hacer daño: un ataque que no quita vida no vale (ver attackProblem).
  const enemies = visibleFoes(s, play.me).filter((enemy) => isInReach(enemy) && canDamage(s, unit, enemy));
  if (!enemies.length) return false;

  const shot = bestShot(s, play, unit, enemies, fireOrigins(s, unit, stay ? null : range, allowedOrigin));
  if (shot) {
    const interrupted = yield* doMove(s, play, unit, samePos(shot.from, unit) ? null : shot.from);
    // Desde la casilla nueva puede no verlo ya (el bosque solo se ve desde al lado): entonces espera.
    const attacked = !interrupted && (yield* act(s, play, { kind: 'attack', uid: unit.uid, target: shot.target.uid }));
    if (!attacked) yield* finish(s, play, unit);
    return true;
  }
  if (!chase) return false;
  return yield* chaseNearest(s, play, unit, enemies, range);
}

// ---------------------------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------------------------

/** Capturar el edificio de debajo y avisar a la interfaz. */
export function* captureHere(s: GameState, play: PlayCtx, unit: Unit): Generator<GameEvent, boolean> {
  if (!canCapture(s, unit)) return false;
  return yield* act(s, play, { kind: 'capture', uid: unit.uid });
}
