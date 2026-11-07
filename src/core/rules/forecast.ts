/**
 * Prevision de combate y zona de amenaza (para la interfaz y la IA). Solo consultas: no cambian nada.
 */

import { unitTypeOf } from '../gameContent';
import { diamond } from '../geom';
import { createLayer } from '../mapGrid';
import type { Grid } from '../util/grid';
import { canFight, firesAfterMove } from '../util/predicates';
import type { GameState, TeamId, Unit } from '../model';
import { canCounter, fireOrigins, hitChance } from './combat';
import { moveRange, type MoveRange } from './movement';
import { reversed, type Engagement } from './engagement';
import { boundedDistribution } from '../damage';
import { damageModelOf } from '../ruleModules/ruleset';
import { isVisibleFoe, sightOf } from './visibility';
import { canStillFire } from './unitTurn';

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

/** Percentiles del margen probable que se enseña (5 % y 95 %). */
const LOW_PERCENTILE = 0.05;
const HIGH_PERCENTILE = 0.95;
/** Margen para que la suma de probabilidades (coma flotante) no se quede justo por debajo. */
const EPSILON = 1e-9;

/** Lo que se enseña de un reparto de daño. */
interface DamageSummary {
  expected: number;
  killChance: number;
  low: number;
  high: number;
}

/** Media, probabilidad de matar y margen probable de un reparto de daño, sin pasar de `cap` (la vida). */
function summarize(distribution: readonly number[], cap: number): DamageSummary {
  let expected = 0;
  let killChance = 0;
  let accumulated = 0;
  let low = -1;
  let high = -1;
  for (const [amount, probability] of distribution.entries()) {
    const damage = Math.min(amount, cap);
    expected += damage * probability;
    if (amount >= cap) killChance += probability;
    accumulated += probability;
    if (low < 0 && accumulated >= LOW_PERCENTILE - EPSILON) low = damage;
    if (high < 0 && accumulated >= HIGH_PERCENTILE - EPSILON) high = damage;
  }
  if (high < 0) high = Math.min(distribution.length - 1, cap);
  if (low < 0) low = 0;
  return { expected, killChance, low, high };
}

/** Suma `weight` veces el reparto `part` a `total` (en su sitio). */
function addWeighted(total: number[], part: readonly number[], weight: number): void {
  for (const [damage, probability] of part.entries()) total[damage] = (total[damage] ?? 0) + weight * probability;
}

/**
 * Reparto del daño del contraataque: para cada vida que le pueda quedar al defensor, el daño que
 * devolveria, pesado por lo probable que es. Lo que falta hasta 1 (el defensor cae) es daño 0.
 */
function counterDistribution(s: GameState, fight: Engagement, attackDist: readonly number[]): number[] {
  const counterChance = hitChance(s, reversed(fight));
  const defenderLife = fight.defender.life;
  const total: number[] = [];
  for (const [damage, probability] of attackDist.entries()) {
    const lifeLeft = defenderLife - Math.min(damage, defenderLife);
    if (lifeLeft <= 0 || !probability) continue;
    addWeighted(total, boundedDistribution(damageModelOf(s), lifeLeft, counterChance), probability);
  }
  const counter = Array.from(total, (probability) => probability ?? 0);
  const noCounter = 1 - counter.reduce((sum, probability) => sum + probability, 0);
  counter[0] = (counter[0] ?? 0) + Math.max(0, noCounter);
  return counter;
}

/**
 * Lo que se espera de un combate (`fight`: el de ahora, o uno hipotetico desde otra casilla o con
 * otra vida: ver `engagement`), con su contraataque si lo hay.
 */
export function combatForecast(s: GameState, fight: Engagement): CombatForecast {
  const { attacker, defender } = fight;
  const attackDist = boundedDistribution(damageModelOf(s), attacker.life, hitChance(s, fight));
  const main = summarize(attackDist, defender.life);
  const expected = Math.round(main.expected);
  let counter: CombatForecast['counter'] = null;
  if (canCounter(s, fight)) {
    const back = summarize(counterDistribution(s, fight, attackDist), attacker.life);
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
 * Casillas que los enemigos de `viewer` podrian atacar en su proximo turno (moverse y disparar):
 * solo cuentan las unidades enemigas que `viewer` ve.
 */
export function threatMap(s: GameState, viewer: TeamId): Grid<boolean> {
  const threatened = createLayer(s, false);
  const sees = sightOf(s, viewer);
  for (const unit of s.units) if (isVisibleFoe(s, viewer, unit, sees)) unitThreat(s, unit, threatened);
  return threatened;
}

/**
 * Casillas que una unidad podria atacar en su proximo turno (moviendose si puede).
 * Las que no pueden moverse y disparar (firesAfterMove) solo cuentan desde donde estan.
 */
export function unitThreat(s: GameState, unit: Unit, out: Grid<boolean> = createLayer(s, false), range?: MoveRange): Grid<boolean> {
  const attack = unitTypeOf(s, unit).attack;
  if (!attack) return out;
  // Las que pueden mover y disparar atacan desde cualquier casilla a la que lleguen (como si fuera su turno).
  const moveReach = firesAfterMove(s, unit) ? (range ?? moveRange(s, unit)) : null;
  for (const origin of fireOrigins(s, unit, moveReach)) {
    for (const pos of diamond(out, origin, attack.minRange, attack.maxRange)) out.set(pos, true);
  }
  return out;
}

/** Lo que la unidad puede atacar este turno con su alcance de movimiento `range` (null si no puede disparar). */
export function attackZone(s: GameState, unit: Unit, range: MoveRange): Grid<boolean> | null {
  if (!canFight(s, unit) || !canStillFire(s, unit)) return null;
  return unitThreat(s, unit, createLayer(s, false), range);
}
