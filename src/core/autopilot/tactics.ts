/**
 * Lo que puede hacer una unidad, paso a paso, al cumplir una orden permanente o en el turno de la
 * IA: retirarse a curarse, atacar (o acercarse) y capturar el edificio de debajo. Cada paso devuelve
 * true si ha usado la unidad. Los usan las ordenes (standingOrders.ts, una regla de la partida) y la
 * IA (ai/unitTurn.ts, ai/tactics.ts), que los reutiliza.
 */

import { manhattan, samePos } from '../geom';
import { canCapture } from '../rules/capture';
import { fireOrigins } from '../rules/combat';
import { canDamage, inAttackRange } from '../rules/weapons';
import type { MoveRange } from '../rules/movement';
import { mergeTargets } from '../rules/transport';
import { canStillFire } from '../rules/unitTurn';
import type { ActionPlan, Building, GameState, Pos, Unit } from '../model';
import { maxBy, minBy } from '../util/pick';
import { act, bestMoveToward, doMove, finish, stepsMap, strikeReach, type PlayCtx } from './context';
import { knownFoes } from '../playerView';
import { canRepair } from '../rules/supply';
import { buildingAt } from '../rules/queries';
import { canFight } from '../util/predicates';
import { attackScore, unitValue } from './scoring';
import type { EngagementPolicy, FiringPositions } from './engagement';

// ---------------------------------------------------------------------------------------------
// Retirarse
// ---------------------------------------------------------------------------------------------

/** Unirse a la unidad igual mas cercana si la suma de vidas no pasa de profile.weights.maxMergedLife. */
function* mergeWithMate(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  const mates = mergeTargets(s, unit, range).filter((mate) => mate.life + unit.life <= play.profile.weights.maxMergedLife);
  const nearest = minBy(mates, (mate) => manhattan(unit, mate));
  if (!nearest) return false;
  return yield* act({ kind: 'merge', uid: unit.uid, into: nearest.uid });
}

/** El edificio propio libre que la repara al que menos pasos hay (null si no llega a ninguno). */
function nearestRepairBuilding(s: GameState, play: PlayCtx, unit: Unit): Building | null {
  // La casilla en la que esta no sale: si alli la repararan, ya se habria quedado (retreat).
  const steps = stepsMap(s, play, unit);
  const repairShops = s.buildings.filter((building) => canRepair(s, building, unit) && steps.at(building) < Infinity);
  return minBy(repairShops, (building) => steps.at(building));
}

/** Ir a curarse: unirse a otra igual, quedarse si ya esta en un edificio que la repara o ir al mas cercano. */
export function* retreat(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange): ActionPlan<boolean> {
  if (yield* mergeWithMate(s, play, unit, range)) return true;
  // [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  const here = buildingAt(s, unit);
  if (here && canRepair(s, here, unit)) {
    yield* finish(s, unit);
    return true;
  }
  const repairShop = nearestRepairBuilding(s, play, unit);
  if (!repairShop) return false;
  yield* doMove(unit, bestMoveToward(s, play, unit, repairShop, range));
  yield* finish(s, unit);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Atacar
// ---------------------------------------------------------------------------------------------

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
  const isPlannedTarget = play.focusFire.get(unit.uid) === target.uid;
  return isPlannedTarget ? score + play.profile.weights.focusFireBonus * unitValue(s, play.profile.weights, target) : score;
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
function* chaseNearest(s: GameState, play: PlayCtx, unit: Unit, enemies: Unit[], range: MoveRange): ActionPlan<boolean> {
  const prey = minBy(
    enemies.filter((enemy) => canDamage(s, unit, enemy)),
    (enemy) => manhattan(unit, enemy),
  );
  if (!prey) return false;
  yield* doMove(unit, bestMoveToward(s, play, unit, prey, range));
  yield* finish(s, unit);
  return true;
}

/** Las casillas desde las que dispararia con esa forma de pelear (la suya, la primera). */
function originsFor(s: GameState, unit: Unit, range: MoveRange, firesFrom: FiringPositions): Pos[] {
  if (firesFrom === 'here') return fireOrigins(s, unit, null);
  return fireOrigins(s, unit, range, firesFrom === 'anywhere' ? undefined : firesFrom);
}

/** Atacar al mejor objetivo a tiro o, si no hay, lo que diga `policy` (perseguir al mas cercano o nada). */
export function* tryAttack(s: GameState, play: PlayCtx, unit: Unit, range: MoveRange, policy: EngagementPolicy): ActionPlan<boolean> {
  const { engages } = policy;
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (!canFight(s, unit) || !canStillFire(s, unit)) return false;
  // Solo mira a los enemigos dentro del radio al que llega a disparar este turno (strikeReach, con el
  // clima): de ellos sale a quien dispara y, si no puede a ninguno, a quien persigue (chaseNearest).
  const reach = strikeReach(s, unit);
  const isInReach = (enemy: Unit) => manhattan(unit, enemy) <= reach && (!engages || engages(enemy));
  // Solo a los que puede hacer daño: un ataque que no quita vida no vale (ver attackProblem).
  const enemies = knownFoes(s, play.me).filter((enemy) => isInReach(enemy) && canDamage(s, unit, enemy));
  if (!enemies.length) return false;

  const shot = bestShot(s, play, unit, enemies, originsFor(s, unit, range, policy.firesFrom));
  if (shot) {
    const interrupted = yield* doMove(unit, samePos(shot.from, unit) ? null : shot.from);
    // Desde la casilla nueva puede no verlo ya (el bosque solo se ve desde al lado): entonces espera.
    const attacked = !interrupted && (yield* act({ kind: 'attack', uid: unit.uid, target: shot.target.uid }));
    if (!attacked) yield* finish(s, unit);
    return true;
  }
  if (policy.whenNoShot === 'hold') return false;
  return yield* chaseNearest(s, play, unit, enemies, range);
}

// ---------------------------------------------------------------------------------------------
// Capturar
// ---------------------------------------------------------------------------------------------

/** Capturar el edificio de debajo y avisar a la interfaz. */
export function* captureHere(s: GameState, unit: Unit): ActionPlan<boolean> {
  if (!canCapture(s, unit)) return false;
  return yield* act({ kind: 'capture', uid: unit.uid });
}
