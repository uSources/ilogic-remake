/**
 * Ayudas para las ordenes del jugador (mover, atacar, mover en grupo): que casilla elegir y si una
 * orden es arriesgada. Logica pura, sin interfaz: la usa GameScene y se puede probar.
 */
import { POWER, UNIT, Movement } from './data';
import { manhattan, samePos } from './geom';
import { canWalk, inAttackRange, moveCost, pathCost, pathTo, reachableTiles, tileProtection, type MoveRange } from './rules';
import type { GameState, Pos, Unit } from './types';

/**
 * Mejor casilla desde la que `u` puede atacar a `t` con su alcance `r`: la de `end` (donde acaba el
 * camino trazado) si vale; si no, la mas cercana a `end`, luego la de mas defensa y luego la mas
 * cercana a la unidad. Null si no puede atacarle.
 */
export function bestAttackTile(s: GameState, u: Unit, t: Unit, r: MoveRange, end: Pos = u): Pos | null {
  if (!UNIT.canfight[u.type] || !u.canFire || !(POWER[u.type]![t.type]! > 0)) return null;
  // Las que no pueden mover y disparar solo atacan desde donde estan.
  if (UNIT.minalc[u.type]! > 0) return inAttackRange(u.type, u, t) ? { x: u.x, y: u.y } : null;
  const cands: Pos[] = [];
  if (inAttackRange(u.type, u, t)) cands.push({ x: u.x, y: u.y });
  cands.push(...reachableTiles(r).filter((p) => inAttackRange(u.type, p, t)));
  if (!cands.length) return null;
  const onTrail = cands.find((c) => samePos(c, end));
  if (onTrail) return onTrail;
  const prot = (p: Pos) => tileProtection(s, p);
  cands.sort((a, b) => manhattan(end, a) - manhattan(end, b) || prot(a) - prot(b) || manhattan(u, a) - manhattan(u, b));
  return cands[0]!;
}

/** Casilla alcanzable mas cercana a `goal` (si empata, la que cuesta menos); null si ninguna acerca. */
export function closestStep(u: Unit, goal: Pos, r: MoveRange): Pos | null {
  let best: Pos | null = null;
  let bestD = manhattan(u, goal);
  for (const p of reachableTiles(r)) {
    const d = manhattan(p, goal);
    if (d < bestD || (d === bestD && best && r.steps[p.x]![p.y]! < r.steps[best.x]![best.y]!)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * Camino que se traza al pasar el cursor por `t`: si vuelve sobre el camino, se recorta; si es la
 * casilla de al lado y cabe en el movimiento, se alarga; si no, el camino mas corto hasta alli (o el
 * mismo si no se llega). `block` = casillas por las que no puede pasar (enemigos a la vista).
 */
export function extendTrail(s: GameState, u: Unit, r: MoveRange, block: boolean[][], trail: Pos[], t: Pos): Pos[] {
  const cur = trail.length ? trail : [{ x: u.x, y: u.y }];
  const i = cur.findIndex((p) => samePos(p, t));
  if (i >= 0) return cur.slice(0, i + 1);
  const end = cur[cur.length - 1]!;
  const mt = Movement.of(u.type);
  if (
    manhattan(end, t) === 1 &&
    canWalk(s, t.x, t.y, mt) &&
    !block[t.x]![t.y] &&
    pathCost(s, mt, cur) + moveCost(s, mt, t.x, t.y) <= r.maxSteps
  )
    return [...cur, { x: t.x, y: t.y }];
  // Se ha saltado casillas o pasado del movimiento: el camino mas corto hasta ahi (si se llega).
  return r.prev[t.x]![t.y] ? pathTo(r, u, t) : trail;
}
