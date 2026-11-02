/**
 * Prevision de combate y zona de amenaza (para la interfaz y la IA). Solo consultas: no cambian nada.
 */
import { RULES, UNIT } from '../data';
import { diamond, grid } from '../geom';
import type { GameState, Team, Unit } from '../types';
import { canCounter, fireOrigins, hitChance } from './combat';
import { moveRange, type MoveRange } from './movement';
import { visibility } from './visibility';

export interface CombatForecast {
  /** Dano mas probable (media). */
  expected: number;
  /** Margen probable: percentiles 5 y 95. */
  low: number;
  high: number;
  /** Probabilidad de dejar al defensor sin vida (0..1). */
  killChance: number;
  /** Vida del defensor tras el dano esperado. */
  lifeAfter: number;
  /** Contraataque previsto (null si no lo habra). */
  counter: { expected: number; low: number; high: number; killChance: number; lifeAfter: number } | null;
}

/** Distribucion del daño: dist[k] = P(daño = k), sin tope. */
export function damageDistribution(life: number, p: number): number[] {
  const n = Math.max(0, life);
  p = Math.min(1, Math.max(0, p));
  if (RULES.damageSpread === null) {
    let dist = [1];
    for (let i = 0; i < n; i++) {
      const next = Array<number>(dist.length + 1).fill(0);
      for (let k = 0; k < dist.length; k++) {
        next[k]! += dist[k]! * (1 - p);
        next[k + 1]! += dist[k]! * p;
      }
      dist = next;
    }
    return dist;
  }
  // Daño esperado +- spread, uniforme: se muestrea con 401 puntos repartidos.
  const expected = n * p;
  const dist: number[] = [];
  const N = 401;
  for (let i = 0; i < N; i++) {
    const u = (i / (N - 1)) * 2 - 1;
    const k = Math.max(0, Math.round(expected * (1 + u * RULES.damageSpread)));
    dist[k] = (dist[k] ?? 0) + 1 / N;
  }
  for (let k = 0; k < dist.length; k++) dist[k] ??= 0;
  return dist;
}

function summarize(dist: number[], cap: number) {
  let expected = 0,
    killChance = 0,
    acc = 0,
    low = -1,
    high = -1;
  for (let k = 0; k < dist.length; k++) {
    const dmg = Math.min(k, cap);
    expected += dmg * dist[k]!;
    if (k >= cap) killChance += dist[k]!;
    acc += dist[k]!;
    if (low < 0 && acc >= 0.05 - 1e-9) low = dmg;
    if (high < 0 && acc >= 0.95 - 1e-9) high = dmg;
  }
  if (high < 0) high = Math.min(dist.length - 1, cap);
  if (low < 0) low = 0;
  return { expected, killChance, low, high };
}

export function combatForecast(s: GameState, atk: Unit, def: Unit): CombatForecast {
  const dist = damageDistribution(atk.life, hitChance(s, atk, def));
  const main = summarize(dist, def.life);
  const exp = Math.round(main.expected);
  let counter: CombatForecast['counter'] = null;
  if (canCounter(def, atk)) {
    // Para cada vida que le pueda quedar al defensor, el daño que devolveria.
    const pc = hitChance(s, def, atk);
    const total: number[] = [];
    for (let k = 0; k < dist.length; k++) {
      const left = def.life - Math.min(k, def.life);
      if (left <= 0 || !dist[k]) continue;
      const d = damageDistribution(left, pc);
      for (let j = 0; j < d.length; j++) total[j] = (total[j] ?? 0) + dist[k]! * d[j]!;
    }
    for (let j = 0; j < total.length; j++) total[j] ??= 0;
    const noCounter = 1 - total.reduce((a, b) => a + b, 0);
    total[0] = (total[0] ?? 0) + Math.max(0, noCounter);
    const c = summarize(total, atk.life);
    const ce = Math.round(c.expected);
    counter = { expected: ce, low: c.low, high: c.high, killChance: c.killChance, lifeAfter: Math.max(0, atk.life - ce) };
  }
  return { expected: exp, low: main.low, high: main.high, killChance: main.killChance, lifeAfter: Math.max(0, def.life - exp), counter };
}

/**
 * Casillas que el bando `team` podria atacar en su proximo turno (moverse y disparar):
 * solo cuenta las unidades de ese bando que `viewer` ve.
 */
export function threatMap(s: GameState, team: Team, viewer: Team): boolean[][] {
  const out = grid(false);
  const vis = visibility(s, viewer);
  for (const u of s.units) {
    if (u.team !== team || u.carrier !== null || !vis[u.x]![u.y]) continue;
    unitThreat(s, u, out);
  }
  return out;
}

/**
 * Casillas que una unidad podria atacar en su proximo turno (moviendose si puede).
 * Las unidades a distancia no pueden mover y disparar: solo cuentan desde donde estan.
 */
export function unitThreat(s: GameState, u: Unit, out: boolean[][] = grid(false), range?: MoveRange): boolean[][] {
  if (!UNIT.canfight[u.type]) return out;
  const minR = UNIT.minalc[u.type]!,
    maxR = UNIT.alcance[u.type]!;
  if (maxR === 0) return out;
  // Las que pueden mover y disparar atacan desde cualquier casilla a la que lleguen.
  const origins = fireOrigins(u, minR === 0 ? (range ?? moveRange(s, { ...u, active: true, canMove: true })) : null);
  for (const o of origins) for (const p of diamond(o, minR + 1, maxR)) out[p.x]![p.y] = true;
  return out;
}

/** Lo que la unidad puede atacar este turno con su alcance de movimiento `range` (null si no puede disparar). */
export function attackZone(s: GameState, u: Unit, range: MoveRange): boolean[][] | null {
  if (!UNIT.canfight[u.type] || UNIT.alcance[u.type]! === 0 || !u.canFire) return null;
  return unitThreat(s, u, grid(false), range);
}
