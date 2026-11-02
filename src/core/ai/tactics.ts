/**
 * Lo que puede hacer la IA con una unidad, paso a paso: retirarse a curarse, atacar (o acercarse),
 * capturar, avanzar y moverse al azar. Cada paso devuelve true si ha usado la unidad.
 * Los usan el turno de la IA (unitTurn) y las ordenes del jugador (commandTurn).
 */
import { AI, HQ, UNIT, Movement } from '../data';
import { diamond, manhattan, samePos } from '../geom';
import { canCapture, capture, captureEvent } from '../rules/capture';
import { attackEvent, canDamage, fireOrigins, inAttackRange } from '../rules/combat';
import { teamsInZone } from '../rules/control';
import { groundDistance, moveEvent, reachableTiles, type MoveRange } from '../rules/movement';
import { buildingAt, unitAt } from '../rules/queries';
import { merge, mergeTargets } from '../rules/transport';
import { wait } from '../rules/unitActions';
import { visibility } from '../rules/visibility';
import type { GameEvent, GameState, Pos, Rng, Unit } from '../types';
import { bestMoveToward, doMove, occupancyWithout, repairsHere, strikeReach, visibleFoes, type AiCtx } from './context';
import { attackScore } from './scoring';

export function* retreat(s: GameState, ctx: AiCtx, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  // 1) Unirse a una unidad igual si la suma de vidas no pasa de 130.
  const mates = mergeTargets(s, u, range).filter((o) => o.life + u.life <= AI.MAXMERGELIFE);
  if (mates.length) {
    const target = mates.sort((a, b) => manhattan(u, a) - manhattan(u, b))[0]!;
    const path = merge(s, u, target);
    if (path) {
      if (path.ambush) yield moveEvent(u.uid, path);
      else yield { kind: 'merge', uid: u.uid, into: target.uid, path };
      return true;
    }
  }

  // 2) [CAMBIO] Si ya esta en un edificio que la repara, se queda (antes se marchaba a otro).
  if (repairsHere(s, u, u.x, u.y)) {
    wait(u);
    return true;
  }
  // 3) Ir al edificio propio mas cercano que la repare y este libre.
  const dist = groundDistance(s, u, Movement.of(u.type), occupancyWithout(s, ctx, u));
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const b of s.buildings) {
    if (!repairsHere(s, u, b.x, b.y)) continue;
    const d = dist[b.x]![b.y]!;
    if (d > 0 && d < goalD) {
      goal = b;
      goalD = d;
    }
  }
  if (!goal) return false;
  yield* doMove(s, u, bestMoveToward(s, ctx, u, goal, range), range);
  wait(u);
  return true;
}

/**
 * Opciones de tryAttack para las ordenes del jugador: `zone` limita a que enemigos se mira (defender),
 * `chase: false` no persigue a nadie fuera de tiro y `stay` solo dispara desde donde esta.
 */
export interface AttackOpts {
  zone?: (t: Unit) => boolean;
  chase?: boolean;
  stay?: boolean;
  /** Casillas desde las que puede disparar si se mueve (formacion: sin adelantarse a su escuadra). */
  from?: (p: Pos) => boolean;
}

/** Atacar al mejor objetivo a tiro o, si no hay, acercarse al mas cercano (ver AttackOpts). */
export function* tryAttack(
  s: GameState,
  ctx: AiCtx,
  u: Unit,
  range: MoveRange,
  rng: Rng,
  opts: AttackOpts = {},
): Generator<GameEvent, boolean> {
  const { zone, chase: follow = true, stay = false, from: allowed } = opts;
  // [CAMBIO] el original atacaba aunque la unidad no pudiera luchar o no hiciera dano.
  if (!UNIT.canfight[u.type] || !u.canFire) return false;
  const reach = strikeReach(u);
  const enemies = visibleFoes(s, ctx.me).filter((t) => manhattan(u, t) <= reach && (!zone || zone(t)));
  if (!enemies.length) return false;

  // Opciones: (casilla desde la que dispara, objetivo). Las unidades a distancia no pueden mover y disparar.
  let best: { from: Pos; target: Unit; score: number } | null = null;
  const froms = fireOrigins(u, stay ? null : range, allowed);
  for (const t of enemies) {
    for (const from of froms) {
      if (!inAttackRange(u.type, from, t)) continue;
      let score = attackScore(s, ctx, u, t, from);
      // [CAMBIO] Fuego concentrado: el objetivo del plan del turno vale mas (lo rematan entre varias).
      if (ctx.group && ctx.plan.get(u.uid) === t.uid) score += AI.FOCUSFIRE * (UNIT.cost[t.type]! / AI.COSTSCALE);
      if (score <= 0) continue;
      // A igualdad, preferir no moverse o la casilla con mas defensa (menor multiplicador).
      if (!best || score > best.score) best = { from, target: t, score };
    }
  }
  if (best) {
    if (yield* doMove(s, u, samePos(best.from, u) ? null : best.from, range)) return true;
    yield attackEvent(s, u, best.target, rng);
    return true;
  }
  // Nadie a tiro este turno: acercarse al enemigo visible mas cercano al que pueda danar.
  if (!follow) return false;
  const chase = enemies.filter((t) => canDamage(u, t)).sort((a, b) => manhattan(u, a) - manhattan(u, b))[0];
  if (!chase) return false;
  yield* doMove(s, u, bestMoveToward(s, ctx, u, chase, range), range);
  wait(u);
  return true;
}

/** Capturar el edificio de debajo y avisar a la interfaz. */
export function* captureHere(s: GameState, u: Unit): Generator<GameEvent, boolean> {
  if (!canCapture(s, u)) return false;
  const b = buildingAt(s, u.x, u.y)!;
  const r = capture(s, u);
  if (!r) return false;
  yield captureEvent(u, b, r);
  return true;
}

export function* tryCapture(s: GameState, ctx: AiCtx, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  if (!UNIT.cancapt[u.type]) return false;
  if (yield* captureHere(s, u)) return true;
  const vis = visibility(s, ctx.me);
  const dist = groundDistance(s, u, Movement.of(u.type), occupancyWithout(s, ctx, u));
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const p of diamond(u, 1, AI.MAXCAPTDIST)) {
    const b = buildingAt(s, p.x, p.y);
    if (!b || b.owner === ctx.me || !vis[p.x]![p.y]) continue;
    const occupant = unitAt(s, p.x, p.y);
    if (occupant && occupant.team === ctx.me) continue;
    const d = dist[p.x]![p.y]!;
    // La Base enemiga vale mas: se cuenta como si estuviera mas cerca.
    const score = d - (b.type === HQ ? 4 : 0);
    if (d > 0 && score < goalD) {
      goal = p;
      goalD = score;
    }
  }
  if (!goal) return false;
  yield* doMove(s, u, bestMoveToward(s, ctx, u, goal, range), range);
  if (!(yield* captureHere(s, u))) wait(u);
  return true;
}

/**
 * Avanzar: las unidades que capturan van al edificio ajeno mas cercano; las demas, hacia
 * la unidad del jugador mas cercana o, si no hay, hacia su Base.
 * [CAMBIO] en el original este paso casi nunca se activaba y la IA paseaba al azar.
 */
export function* advance(s: GameState, ctx: AiCtx, u: Unit, range: MoveRange): Generator<GameEvent, boolean> {
  const dist = groundDistance(s, u, Movement.of(u.type), occupancyWithout(s, ctx, u));
  // Las que capturan: edificios ajenos, con prioridad a la Base enemiga y a los del jugador.
  const bonus = (g: Pos): number => {
    // [CAMBIO] Puntos de control que no son suyos: cuentan como si estuvieran mas cerca.
    if (s.controlPoints?.some((c) => c.x === g.x && c.y === g.y)) return AI.CONTROLPOINT;
    const b = buildingAt(s, g.x, g.y);
    if (!b || !UNIT.cancapt[u.type]) return 0;
    return b.type === HQ && b.owner !== null ? AI.CAPTUREHQ : b.owner !== null ? AI.CAPTUREOWNED : 0;
  };
  const vis = visibility(s, ctx.me);
  // [CAMBIO] Puntos de control que no son suyos o que estan disputados (sus zonas: ver controlRound).
  const points: Pos[] = (s.controlPoints ?? []).filter((c) => (c.owner !== ctx.me || teamsInZone(s, c).size > 1) && !unitAt(s, c.x, c.y));
  const goals: Pos[] = UNIT.cancapt[u.type]
    ? [...s.buildings.filter((b) => b.owner !== ctx.me), ...points]
    : [
        ...s.units.filter((o) => o.team !== ctx.me && o.carrier === null && vis[o.x]![o.y] && canDamage(u, o)),
        ...s.buildings.filter((b) => b.owner !== ctx.me && b.owner !== null && b.type === HQ),
        ...points,
      ];
  let goal: Pos | null = null;
  let goalD = Infinity;
  for (const g of goals) {
    // Distancia por tierra a la casilla o, si esta ocupada, a una vecina.
    let d = dist[g.x]![g.y]!;
    if (d === 0) {
      for (const p of diamond(g, 1, 1)) {
        const dn = dist[p.x]![p.y]!;
        if (dn > 0 && (d === 0 || dn < d)) d = dn;
      }
    }
    if (d > 0 && d - bonus(g) < goalD) {
      goal = g;
      goalD = d - bonus(g);
    }
  }
  if (!goal) return false;
  // [CAMBIO] Una unidad que no captura no se queda encima de la Base enemiga (taparia a los que si).
  const blocks = !UNIT.cancapt[u.type] && !!buildingAt(s, goal.x, goal.y);
  const dest = bestMoveToward(s, ctx, u, goal, range, blocks);
  if (!dest) return false;
  yield* doMove(s, u, dest, range);
  wait(u);
  return true;
}

/** [CAMBIO] eleccion uniforme (el original nunca elegia la ultima casilla). */
export function* randomMove(s: GameState, u: Unit, range: MoveRange, rng: Rng): Generator<GameEvent> {
  const options: Pos[] = reachableTiles(range);
  if (options.length) yield* doMove(s, u, options[Math.floor(rng() * options.length)]!, range);
  wait(u);
}
