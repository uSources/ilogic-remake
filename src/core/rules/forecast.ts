/**
 * Prevision de combate y zona de amenaza (para la interfaz y la IA). Solo consultas: no cambian nada.
 */
import { RULES, UNIT } from '../data';
import { diamond, grid } from '../geom';
import { cellAt, setCell } from '../util/grid';
import { canFight, isOnMap } from '../util/predicates';
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

/** Puntos con los que se muestrea el reparto del daño con RULES.damageSpread. */
const SPREAD_SAMPLES = 401;
/** Percentiles del margen probable que se enseña (5 % y 95 %). */
const LOW_PERCENTILE = 0.05;
const HIGH_PERCENTILE = 0.95;
/** Margen para que la suma de probabilidades (coma flotante) no se quede justo por debajo. */
const EPSILON = 1e-9;

/** Distribucion del daño: dist[k] = P(daño = k), sin tope. */
export function damageDistribution(life: number, chance: number): number[] {
  const shots = Math.max(0, life);
  const p = Math.min(1, Math.max(0, chance));
  return RULES.damageSpread === null ? shotsDistribution(shots, p) : spreadDistribution(shots * p, RULES.damageSpread);
}

/** Original: `shots` disparos que aciertan cada uno con probabilidad `p` (binomial). */
function shotsDistribution(shots: number, p: number): number[] {
  let dist = [1];
  for (let shot = 0; shot < shots; shot++) {
    const next = Array<number>(dist.length + 1).fill(0);
    for (let hits = 0; hits < dist.length; hits++) {
      next[hits]! += dist[hits]! * (1 - p);
      next[hits + 1]! += dist[hits]! * p;
    }
    dist = next;
  }
  return dist;
}

/** [CAMBIO] Daño esperado +- `spread`, uniforme: se muestrea con SPREAD_SAMPLES puntos repartidos. */
function spreadDistribution(expected: number, spread: number): number[] {
  const dist: number[] = [];
  for (let i = 0; i < SPREAD_SAMPLES; i++) {
    const offset = (i / (SPREAD_SAMPLES - 1)) * 2 - 1;
    const damage = Math.max(0, Math.round(expected * (1 + offset * spread)));
    dist[damage] = (dist[damage] ?? 0) + 1 / SPREAD_SAMPLES;
  }
  return fillHoles(dist);
}

/** Pone 0 en los huecos de un reparto (los daños que no salen nunca). */
function fillHoles(dist: number[]): number[] {
  for (let k = 0; k < dist.length; k++) dist[k] ??= 0;
  return dist;
}

/** Media, probabilidad de matar y margen probable de un reparto de daño, sin pasar de `cap` (la vida). */
function summarize(dist: number[], cap: number) {
  let expected = 0;
  let killChance = 0;
  let accumulated = 0;
  let low = -1;
  let high = -1;
  for (let k = 0; k < dist.length; k++) {
    const damage = Math.min(k, cap);
    expected += damage * dist[k]!;
    if (k >= cap) killChance += dist[k]!;
    accumulated += dist[k]!;
    if (low < 0 && accumulated >= LOW_PERCENTILE - EPSILON) low = damage;
    if (high < 0 && accumulated >= HIGH_PERCENTILE - EPSILON) high = damage;
  }
  if (high < 0) high = Math.min(dist.length - 1, cap);
  if (low < 0) low = 0;
  return { expected, killChance, low, high };
}

/**
 * Reparto del daño del contraataque: para cada vida que le pueda quedar al defensor, el daño que
 * devolveria, pesado por lo probable que es. Lo que falta hasta 1 (el defensor cae) es daño 0.
 */
function counterDistribution(s: GameState, attacker: Unit, defender: Unit, attackDist: number[]): number[] {
  const counterChance = hitChance(s, defender, attacker);
  const total: number[] = [];
  for (let damage = 0; damage < attackDist.length; damage++) {
    const lifeLeft = defender.life - Math.min(damage, defender.life);
    if (lifeLeft <= 0 || !attackDist[damage]) continue;
    const counterDist = damageDistribution(lifeLeft, counterChance);
    for (let j = 0; j < counterDist.length; j++) total[j] = (total[j] ?? 0) + attackDist[damage]! * counterDist[j]!;
  }
  fillHoles(total);
  const noCounter = 1 - total.reduce((sum, probability) => sum + probability, 0);
  total[0] = (total[0] ?? 0) + Math.max(0, noCounter);
  return total;
}

export function combatForecast(s: GameState, attacker: Unit, defender: Unit): CombatForecast {
  const attackDist = damageDistribution(attacker.life, hitChance(s, attacker, defender));
  const main = summarize(attackDist, defender.life);
  const expected = Math.round(main.expected);
  let counter: CombatForecast['counter'] = null;
  if (canCounter(defender, attacker)) {
    const back = summarize(counterDistribution(s, attacker, defender, attackDist), attacker.life);
    const counterExpected = Math.round(back.expected);
    counter = {
      expected: counterExpected,
      low: back.low,
      high: back.high,
      killChance: back.killChance,
      lifeAfter: Math.max(0, attacker.life - counterExpected),
    };
  }
  return {
    expected,
    low: main.low,
    high: main.high,
    killChance: main.killChance,
    lifeAfter: Math.max(0, defender.life - expected),
    counter,
  };
}

/**
 * Casillas que el bando `team` podria atacar en su proximo turno (moverse y disparar):
 * solo cuenta las unidades de ese bando que `viewer` ve.
 */
export function threatMap(s: GameState, team: Team, viewer: Team): boolean[][] {
  const threatened = grid(false);
  const visible = visibility(s, viewer);
  for (const unit of s.units) {
    if (unit.team !== team || !isOnMap(unit) || !cellAt(visible, unit)) continue;
    unitThreat(s, unit, threatened);
  }
  return threatened;
}

/**
 * Casillas que una unidad podria atacar en su proximo turno (moviendose si puede).
 * Las unidades a distancia no pueden mover y disparar: solo cuentan desde donde estan.
 */
export function unitThreat(s: GameState, unit: Unit, out: boolean[][] = grid(false), range?: MoveRange): boolean[][] {
  if (!canFight(unit)) return out;
  const minRange = UNIT.minalc[unit.type]!;
  const maxRange = UNIT.alcance[unit.type]!;
  if (maxRange === 0) return out;
  // Las que pueden mover y disparar atacan desde cualquier casilla a la que lleguen (como si fuera su turno).
  const canMoveAndFire = minRange === 0;
  const moveReach = canMoveAndFire ? (range ?? moveRange(s, { ...unit, active: true, canMove: true })) : null;
  for (const origin of fireOrigins(unit, moveReach)) {
    for (const pos of diamond(origin, minRange + 1, maxRange)) setCell(out, pos, true);
  }
  return out;
}

/** Lo que la unidad puede atacar este turno con su alcance de movimiento `range` (null si no puede disparar). */
export function attackZone(s: GameState, unit: Unit, range: MoveRange): boolean[][] | null {
  if (!canFight(unit) || UNIT.alcance[unit.type]! === 0 || !unit.canFire) return null;
  return unitThreat(s, unit, grid(false), range);
}
