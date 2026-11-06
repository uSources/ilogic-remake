/**
 * [CAMBIO] Formacion: una escuadra con la misma orden avanza junta. Sin ella, los jeeps y tanques
 * llegaban solos antes que la infanteria y los destrozaban. Las rapidas no se adelantan mas de
 * AI.SQUADSPREAD casillas a la mas retrasada (por tierra hasta el destino), salvo para atacar a algo a
 * tiro; cerca del destino, o con enemigos al alcance de la mas retrasada, cada una pelea a su aire.
 */

import { unitTypeOf, weightsOf } from '../gameContent';
import { movementOf } from '../rules/queries';
import { manhattan } from '../geom';
import { distancesIgnoringUnits, reachableTiles, type DistanceMap, type MoveRange } from '../rules/movement';
import { effectiveStandingOrder, sameFormation } from '../squads/standingOrders';
import { canStillMove } from '../rules/unitTurn';
import type { GameState, Pos, Unit } from '../model';
import { compareKeys, maxBy, minBy } from '../util/pick';
import { bestMoveToward, needsRepair, strikeReach, visibleFoes, type PlayCtx } from './context';

/** Casillas por tierra que le quedan hasta `at` desde cada sitio, con su tipo de movimiento. */
const remainingMap = (s: GameState, unit: Unit, at: Pos): DistanceMap => distancesIgnoringUnits(s, at, movementOf(s, unit));

/** Lo que le queda a la unidad hasta el destino de su orden (Infinity si no llega). */
const remainingOf = (s: GameState, unit: Unit): number => remainingMap(s, unit, effectiveStandingOrder(s, unit)!.at).at(unit);

/** Las otras unidades de su formacion que cuentan (vivas, en el mapa, sin volver a curarse). */
function formationMates(s: GameState, unit: Unit): Unit[] {
  return s.units.filter(
    (other) => other !== unit && other.carrier === null && other.life > 0 && !needsRepair(s, other) && sameFormation(s, unit, other),
  );
}

/**
 * Orden de juego de las unidades con orden: las de una misma formacion juntas, primero las mas
 * retrasadas y, a igualdad, las mas lentas; las demas, en su orden de siempre.
 */
export function standingOrderPlayOrder(s: GameState, units: readonly Unit[]): Unit[] {
  const ordered: Unit[] = [];
  const placed = new Set<Unit>();
  for (const unit of units) {
    if (placed.has(unit)) continue;
    const group = units.filter((other) => other === unit || (!placed.has(other) && sameFormation(s, unit, other)));
    const remaining = new Map(group.map((member) => [member, remainingOf(s, member)]));
    const speed = (member: Unit) => unitTypeOf(s, member).move;
    group.sort((firstUnit, secondUnit) => remaining.get(secondUnit)! - remaining.get(firstUnit)! || speed(firstUnit) - speed(secondUnit));
    for (const member of group) placed.add(member);
    ordered.push(...group);
  }
  return ordered;
}

export interface Formation {
  /** Lo que le queda a la unidad desde cada casilla. */
  remaining: DistanceMap;
  /** No puede acabar mas cerca del destino que esto. */
  minRemaining: number;
  /** La compañera mas retrasada: a igualdad, se coloca cerca de ella. */
  rear: Unit;
}

/** Una compañera de formacion: lo que le queda ahora y donde podria quedarse al acabar este turno. */
interface MateProgress {
  unit: Unit;
  remaining: number;
  /** Lo que le quedaria si aun no ha jugado y avanza todo lo que puede este turno. */
  afterThisTurn: number;
}

/**
 * Las compañeras que llegan al destino, con lo que les queda. Las que aun no han jugado este turno
 * cuentan donde podrian acabar (si no, la mas lenta, que juega primero, esperaria a una rapida que va
 * igual de retrasada).
 */
function matesProgress(s: GameState, unit: Unit): MateProgress[] {
  return formationMates(s, unit)
    .map((mate) => {
      const remaining = remainingOf(s, mate);
      const movesThisTurn = canStillMove(mate);
      return {
        unit: mate,
        remaining,
        afterThisTurn: movesThisTurn ? Math.max(0, remaining - unitTypeOf(s, mate).move) : remaining,
      };
    })
    .filter((mate) => mate.remaining < Infinity);
}

/** Limite de formacion para esta unidad, o null si va suelta (sin escuadra, sola o ya cerca). */
export function formation(s: GameState, ai: PlayCtx, unit: Unit): Formation | null {
  const standingOrder = effectiveStandingOrder(s, unit);
  if (!standingOrder || needsRepair(s, unit)) return null;
  const mates = matesProgress(s, unit);
  if (!mates.length) return null;
  const remaining = remainingMap(s, unit, standingOrder.at);
  const mine = remaining.at(unit);
  if (mine === Infinity) return null; // no llega por tierra: como siempre
  const rearAfterThisTurn = maxBy(mates, (mate) => mate.afterThisTurn)!;
  const furthestBehind = maxBy(mates, (mate) => mate.remaining)!;
  const rear = mine > furthestBehind.remaining ? { unit, remaining: mine } : furthestBehind;
  // Cerca del destino (la mas retrasada ya llega a tiro) o con enemigos a su alcance: se suelta.
  const rearReach = strikeReach(s, rear.unit);
  if (rear.remaining <= rearReach) return null;
  if (visibleFoes(s, ai.me).some((foe) => manhattan(foe, rear.unit) <= rearReach)) return null;
  return { remaining, minRemaining: rearAfterThisTurn.afterThisTurn - weightsOf(s).SQUADSPREAD, rear: rearAfterThisTurn.unit };
}

/**
 * Casilla a la que avanzar sin pasarse del limite de la formacion: lo mas cerca del destino que se
 * pueda y, a igualdad, junto a la mas retrasada. null = mejor quedarse (ya va por delante).
 */
function formationMove(unit: Unit, range: MoveRange, squadFormation: Formation): Pos | null {
  const progress = (pos: Pos) => [squadFormation.remaining.at(pos), manhattan(pos, squadFormation.rear)];
  const keepsFormation = (pos: Pos) => {
    const remaining = squadFormation.remaining.at(pos);
    return remaining >= squadFormation.minRemaining && remaining !== Infinity;
  };
  const best = minBy(reachableTiles(range).filter(keepsFormation), progress);
  const isBetterThanStaying = best !== null && compareKeys(progress(best), progress(unit)) < 0;
  return isBetterThanStaying ? best : null;
}

/** Hacia el destino de su orden: en formacion si va con su escuadra, si no como siempre. */
export function standingOrderStep(
  s: GameState,
  ai: PlayCtx,
  unit: Unit,
  at: Pos,
  range: MoveRange,
  squadFormation: Formation | null,
): Pos | null {
  return squadFormation ? formationMove(unit, range, squadFormation) : bestMoveToward(s, ai, unit, at, range);
}

/** En formacion solo dispara desde donde no se adelanta a su escuadra (o desde donde esta). */
export const formationFrom = (formation: Formation | null) =>
  formation ? (pos: Pos) => formation.remaining.at(pos) >= formation.minRemaining : undefined;
