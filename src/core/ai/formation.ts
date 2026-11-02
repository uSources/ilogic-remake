/**
 * [CAMBIO] Formacion: una escuadra con la misma orden avanza junta. Sin ella, los jeeps y tanques
 * llegaban solos antes que la infanteria y los destrozaban. Las rapidas no se adelantan mas de
 * AI.SQUADSPREAD casillas a la mas retrasada (por tierra hasta el destino), salvo para atacar a algo a
 * tiro; cerca del destino, o con enemigos al alcance de la mas retrasada, cada una pelea a su aire.
 */
import { AI, UNIT, Movement } from '../data';
import { grid, manhattan, samePos } from '../geom';
import { groundDistance, reachableTiles, type MoveRange } from '../rules/movement';
import { visibility } from '../rules/visibility';
import { effectiveCommand, sameFormation } from '../squads';
import type { GameState, Pos, Unit } from '../types';
import { bestMoveToward, needsRepair, type AiCtx } from './context';

/** Casillas por tierra que le quedan hasta `at` desde cada sitio, con su tipo de movimiento. */
const remainingMap = (s: GameState, u: Unit, at: Pos): number[][] => groundDistance(s, at, Movement.of(u.type), grid(false));
/** Lo que queda desde `p` (Infinity si no llega). */
const remainingAt = (rem: number[][], at: Pos, p: Pos): number => (samePos(p, at) ? 0 : rem[p.x]![p.y]! || Infinity);
const remainingOf = (s: GameState, u: Unit): number => {
  const at = effectiveCommand(s, u)!.at;
  return remainingAt(remainingMap(s, u, at), at, u);
};
/** Hasta donde puede llegar y disparar este turno. */
const strikeReach = (u: Unit): number => UNIT.mover[u.type]! + UNIT.alcance[u.type]!;

/** Las otras unidades de su formacion que cuentan (vivas, en el mapa, sin volver a curarse). */
function formationMates(s: GameState, u: Unit): Unit[] {
  return s.units.filter((o) => o !== u && o.carrier === null && o.life > 0 && !needsRepair(o) && sameFormation(s, u, o));
}

/**
 * Orden de juego de las unidades con orden: las de una misma formacion juntas, primero las mas
 * retrasadas y, a igualdad, las mas lentas; las demas, en su orden de siempre.
 */
export function commandOrder(s: GameState, units: readonly Unit[]): Unit[] {
  const out: Unit[] = [];
  const placed = new Set<Unit>();
  for (const u of units) {
    if (placed.has(u)) continue;
    const group = units.filter((o) => o === u || (!placed.has(o) && sameFormation(s, u, o)));
    const key = new Map(group.map((o) => [o, remainingOf(s, o)]));
    group.sort((a, b) => key.get(b)! - key.get(a)! || UNIT.mover[a.type]! - UNIT.mover[b.type]!);
    for (const o of group) placed.add(o);
    out.push(...group);
  }
  return out;
}

export interface Formation {
  /** Lo que le queda a la unidad desde cada casilla. */
  rem: number[][];
  /** No puede acabar mas cerca del destino que esto. */
  minRem: number;
  /** La compañera mas retrasada: a igualdad, se coloca cerca de ella. */
  rear: Unit;
}

/** Limite de formacion para esta unidad, o null si va suelta (sin escuadra, sola o ya cerca). */
export function formation(s: GameState, ctx: AiCtx, u: Unit): Formation | null {
  const c = effectiveCommand(s, u);
  if (!c || needsRepair(u)) return null;
  const at = c.at;
  // Las que aun no han jugado este turno cuentan donde podrian acabar (si no, la mas lenta, que
  // juega primero, esperaria a una rapida que va igual de retrasada).
  const mates = formationMates(s, u)
    .map((o) => {
      const d = remainingOf(s, o);
      return { o, d, next: o.active && o.canMove ? Math.max(0, d - UNIT.mover[o.type]!) : d };
    })
    .filter((m) => m.d < Infinity);
  if (!mates.length) return null;
  const rem = remainingMap(s, u, at);
  const mine = remainingAt(rem, at, u);
  if (mine === Infinity) return null; // no llega por tierra: como siempre
  const rearMate = mates.reduce((a, b) => (b.next > a.next ? b : a));
  const behind = mates.reduce((a, b) => (b.d > a.d ? b : a));
  const rear = mine > behind.d ? { o: u, d: mine } : behind;
  // Cerca del destino (la mas retrasada ya llega a tiro) o con enemigos a su alcance: se suelta.
  if (rear.d <= strikeReach(rear.o)) return null;
  const vis = visibility(s, ctx.me);
  const reach = strikeReach(rear.o);
  if (s.units.some((t) => t.team !== ctx.me && t.carrier === null && t.life > 0 && vis[t.x]![t.y] && manhattan(t, rear.o) <= reach))
    return null;
  return { rem, minRem: rearMate.next - AI.SQUADSPREAD, rear: rearMate.o };
}

/**
 * Casilla a la que avanzar sin pasarse del limite de la formacion: lo mas cerca del destino que se
 * pueda y, a igualdad, junto a la mas retrasada. null = mejor quedarse (ya va por delante).
 */
function formationMove(u: Unit, at: Pos, range: MoveRange, f: Formation): Pos | null {
  let best: Pos | null = null;
  let bestR = remainingAt(f.rem, at, u);
  let bestA = manhattan(u, f.rear);
  for (const p of reachableTiles(range)) {
    const r = remainingAt(f.rem, at, p);
    if (r < f.minRem || r === Infinity) continue;
    const a = manhattan(p, f.rear);
    if (r < bestR || (r === bestR && a < bestA)) {
      best = p;
      bestR = r;
      bestA = a;
    }
  }
  return best;
}

/** Hacia el destino de su orden: en formacion si va con su escuadra, si no como siempre. */
export function commandStep(s: GameState, ctx: AiCtx, u: Unit, at: Pos, range: MoveRange, f: Formation | null): Pos | null {
  return f ? formationMove(u, at, range, f) : bestMoveToward(s, ctx, u, at, range);
}

/** En formacion solo dispara desde donde no se adelanta a su escuadra (o desde donde esta). */
export const formationFrom = (at: Pos, f: Formation | null) => (f ? (p: Pos) => remainingAt(f.rem, at, p) >= f.minRem : undefined);
