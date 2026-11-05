/**
 * Prevision de combate y zona de amenaza (para la interfaz y la IA). Solo consultas: no cambian nada.
 */

import { unitTypeOf } from '../gameContent';
import { diamond } from '../geom';
import { createLayer } from '../mapGrid';
import type { Grid } from '../util/grid';
import { isRanged } from '../abilities';
import { canFight, isOnMap } from '../util/predicates';
import type { GameState, Team, Unit } from '../model';
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

/** Puntos con los que se muestrea el reparto del daño con la regla damageSpread. */
const SPREAD_SAMPLES = 401;
/** Percentiles del margen probable que se enseña (5 % y 95 %). */
const LOW_PERCENTILE = 0.05;
const HIGH_PERCENTILE = 0.95;
/** Margen para que la suma de probabilidades (coma flotante) no se quede justo por debajo. */
const EPSILON = 1e-9;

/** Distribucion del daño: dist[k] = P(daño = k), sin tope. */
export function damageDistribution(s: GameState, life: number, chance: number): number[] {
  const shots = Math.max(0, life);
  const clamped = Math.min(1, Math.max(0, chance));
  return s.rules.damageSpread === null ? shotsDistribution(shots, clamped) : spreadDistribution(shots * clamped, s.rules.damageSpread);
}

/** Original: `shots` disparos que aciertan cada uno con probabilidad `p` (binomial). */
function shotsDistribution(shots: number, chance: number): number[] {
  let distribution = [1];
  for (let shot = 0; shot < shots; shot++) {
    const next = Array<number>(distribution.length + 1).fill(0);
    for (let hits = 0; hits < distribution.length; hits++) {
      next[hits]! += distribution[hits]! * (1 - chance);
      next[hits + 1]! += distribution[hits]! * chance;
    }
    distribution = next;
  }
  return distribution;
}

/** [CAMBIO] Daño esperado +- `spread`, uniforme: se muestrea con SPREAD_SAMPLES puntos repartidos. */
function spreadDistribution(expected: number, spread: number): number[] {
  const distribution: number[] = [];
  for (let i = 0; i < SPREAD_SAMPLES; i++) {
    const offset = (i / (SPREAD_SAMPLES - 1)) * 2 - 1;
    const damage = Math.max(0, Math.round(expected * (1 + offset * spread)));
    distribution[damage] = (distribution[damage] ?? 0) + 1 / SPREAD_SAMPLES;
  }
  return fillHoles(distribution);
}

/** Pone 0 en los huecos de un reparto (los daños que no salen nunca). */
function fillHoles(distribution: number[]): number[] {
  for (let k = 0; k < distribution.length; k++) distribution[k] ??= 0;
  return distribution;
}

/** Media, probabilidad de matar y margen probable de un reparto de daño, sin pasar de `cap` (la vida). */
function summarize(distribution: number[], cap: number) {
  let expected = 0;
  let killChance = 0;
  let accumulated = 0;
  let low = -1;
  let high = -1;
  for (let amount = 0; amount < distribution.length; amount++) {
    const damage = Math.min(amount, cap);
    expected += damage * distribution[amount]!;
    if (amount >= cap) killChance += distribution[amount]!;
    accumulated += distribution[amount]!;
    if (low < 0 && accumulated >= LOW_PERCENTILE - EPSILON) low = damage;
    if (high < 0 && accumulated >= HIGH_PERCENTILE - EPSILON) high = damage;
  }
  if (high < 0) high = Math.min(distribution.length - 1, cap);
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
    const counterDist = damageDistribution(s, lifeLeft, counterChance);
    for (let j = 0; j < counterDist.length; j++) total[j] = (total[j] ?? 0) + attackDist[damage]! * counterDist[j]!;
  }
  fillHoles(total);
  const noCounter = 1 - total.reduce((sum, probability) => sum + probability, 0);
  total[0] = (total[0] ?? 0) + Math.max(0, noCounter);
  return total;
}

export function combatForecast(s: GameState, attacker: Unit, defender: Unit): CombatForecast {
  const attackDist = damageDistribution(s, attacker.life, hitChance(s, attacker, defender));
  const main = summarize(attackDist, defender.life);
  const expected = Math.round(main.expected);
  let counter: CombatForecast['counter'] = null;
  if (canCounter(s, defender, attacker)) {
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
export function threatMap(s: GameState, team: Team, viewer: Team): Grid<boolean> {
  const threatened = createLayer(s, false);
  const visible = visibility(s, viewer);
  for (const unit of s.units) {
    if (unit.team !== team || !isOnMap(unit) || !visible.at(unit)) continue;
    unitThreat(s, unit, threatened);
  }
  return threatened;
}

/**
 * Casillas que una unidad podria atacar en su proximo turno (moviendose si puede).
 * Las unidades a distancia no pueden mover y disparar: solo cuentan desde donde estan.
 */
export function unitThreat(s: GameState, unit: Unit, out: Grid<boolean> = createLayer(s, false), range?: MoveRange): Grid<boolean> {
  const attack = unitTypeOf(s, unit).attack;
  if (!attack) return out;
  // Las que pueden mover y disparar atacan desde cualquier casilla a la que lleguen (como si fuera su turno).
  const canMoveAndFire = !isRanged(s, unit);
  const moveReach = canMoveAndFire ? (range ?? moveRange(s, { ...unit, active: true, canMove: true })) : null;
  for (const origin of fireOrigins(s, unit, moveReach)) {
    for (const pos of diamond(out, origin, attack.minRange, attack.maxRange)) out.set(pos, true);
  }
  return out;
}

/** Lo que la unidad puede atacar este turno con su alcance de movimiento `range` (null si no puede disparar). */
export function attackZone(s: GameState, unit: Unit, range: MoveRange): Grid<boolean> | null {
  if (!canFight(s, unit) || !unit.canFire) return null;
  return unitThreat(s, unit, createLayer(s, false), range);
}
