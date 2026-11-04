/**
 * [CAMBIO] Formacion: una escuadra con la misma orden avanza junta. Sin ella, los jeeps y tanques
 * llegaban solos antes que la infanteria y los destrozaban. Las rapidas no se adelantan mas de
 * AI.SQUADSPREAD casillas a la mas retrasada (por tierra hasta el destino), salvo para atacar a algo a
 * tiro; cerca del destino, o con enemigos al alcance de la mas retrasada, cada una pelea a su aire.
 */
import { AI, UNIT, Movement } from '../data';
import { manhattan } from '../geom';
import { distancesIgnoringUnits, reachableTiles, type DistanceMap, type MoveRange } from '../rules/movement';
import { effectiveCommand, sameFormation } from '../squads';
import type { GameState, Pos, Unit } from '../types';
import { compareKeys, maxBy, minBy } from '../util/pick';
import { bestMoveToward, needsRepair, strikeReach, visibleFoes, type AiCtx } from './context';

/** Casillas por tierra que le quedan hasta `at` desde cada sitio, con su tipo de movimiento. */
const remainingMap = (s: GameState, unit: Unit, at: Pos): DistanceMap => distancesIgnoringUnits(s, at, Movement.of(unit.type));

/** Lo que le queda a la unidad hasta el destino de su orden (Infinity si no llega). */
const remainingOf = (s: GameState, unit: Unit): number => remainingMap(s, unit, effectiveCommand(s, unit)!.at).at(unit);

/** Las otras unidades de su formacion que cuentan (vivas, en el mapa, sin volver a curarse). */
function formationMates(s: GameState, unit: Unit): Unit[] {
  return s.units.filter(
    (other) => other !== unit && other.carrier === null && other.life > 0 && !needsRepair(other) && sameFormation(s, unit, other),
  );
}

/**
 * Orden de juego de las unidades con orden: las de una misma formacion juntas, primero las mas
 * retrasadas y, a igualdad, las mas lentas; las demas, en su orden de siempre.
 */
export function commandOrder(s: GameState, units: readonly Unit[]): Unit[] {
  const ordered: Unit[] = [];
  const placed = new Set<Unit>();
  for (const unit of units) {
    if (placed.has(unit)) continue;
    const group = units.filter((other) => other === unit || (!placed.has(other) && sameFormation(s, unit, other)));
    const remaining = new Map(group.map((member) => [member, remainingOf(s, member)]));
    const speed = (member: Unit) => UNIT.mover[member.type]!;
    group.sort((a, b) => remaining.get(b)! - remaining.get(a)! || speed(a) - speed(b));
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
      const canStillMove = mate.active && mate.canMove;
      return { unit: mate, remaining, afterThisTurn: canStillMove ? Math.max(0, remaining - UNIT.mover[mate.type]!) : remaining };
    })
    .filter((mate) => mate.remaining < Infinity);
}

/** Limite de formacion para esta unidad, o null si va suelta (sin escuadra, sola o ya cerca). */
export function formation(s: GameState, ai: AiCtx, unit: Unit): Formation | null {
  const command = effectiveCommand(s, unit);
  if (!command || needsRepair(unit)) return null;
  const mates = matesProgress(s, unit);
  if (!mates.length) return null;
  const remaining = remainingMap(s, unit, command.at);
  const mine = remaining.at(unit);
  if (mine === Infinity) return null; // no llega por tierra: como siempre
  const rearAfterThisTurn = maxBy(mates, (mate) => mate.afterThisTurn)!;
  const furthestBehind = maxBy(mates, (mate) => mate.remaining)!;
  const rear = mine > furthestBehind.remaining ? { unit, remaining: mine } : furthestBehind;
  // Cerca del destino (la mas retrasada ya llega a tiro) o con enemigos a su alcance: se suelta.
  const rearReach = strikeReach(rear.unit);
  if (rear.remaining <= rearReach) return null;
  if (visibleFoes(s, ai.me).some((foe) => manhattan(foe, rear.unit) <= rearReach)) return null;
  return { remaining, minRemaining: rearAfterThisTurn.afterThisTurn - AI.SQUADSPREAD, rear: rearAfterThisTurn.unit };
}

/**
 * Casilla a la que avanzar sin pasarse del limite de la formacion: lo mas cerca del destino que se
 * pueda y, a igualdad, junto a la mas retrasada. null = mejor quedarse (ya va por delante).
 */
function formationMove(unit: Unit, range: MoveRange, f: Formation): Pos | null {
  const progress = (pos: Pos) => [f.remaining.at(pos), manhattan(pos, f.rear)];
  const keepsFormation = (pos: Pos) => {
    const remaining = f.remaining.at(pos);
    return remaining >= f.minRemaining && remaining !== Infinity;
  };
  const best = minBy(reachableTiles(range).filter(keepsFormation), progress);
  const isBetterThanStaying = best !== null && compareKeys(progress(best), progress(unit)) < 0;
  return isBetterThanStaying ? best : null;
}

/** Hacia el destino de su orden: en formacion si va con su escuadra, si no como siempre. */
export function commandStep(s: GameState, ai: AiCtx, unit: Unit, at: Pos, range: MoveRange, f: Formation | null): Pos | null {
  return f ? formationMove(unit, range, f) : bestMoveToward(s, ai, unit, at, range);
}

/** En formacion solo dispara desde donde no se adelanta a su escuadra (o desde donde esta). */
export const formationFrom = (f: Formation | null) => (f ? (pos: Pos) => f.remaining.at(pos) >= f.minRemaining : undefined);
