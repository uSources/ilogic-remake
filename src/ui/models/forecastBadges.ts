/**
 * Las chapas de la prevision de combate (hud/game/Forecast.tsx): que numero llevan y de que color.
 * Sobre el enemigo, el daño esperado («−45») y, si puede caer, la calavera con su %; sobre tu unidad,
 * el contraataque («↩ −10»), si lo hay. Puro (se prueba sin navegador).
 */
import type { ForecastVM } from '../../hud/store';

/** Desde esta probabilidad de destruirlo, su chapa sale en dorado. */
export const LIKELY_KILL = 0.5;
/** Desde esta probabilidad de que caiga tu unidad en el contraataque, su chapa sale en rojo. */
export const RISKY_COUNTER = 0.2;
/** Por debajo de esta probabilidad no se dice que puede caer. */
export const MENTION_DEATH = 0.01;

/** El color de una chapa: crema, dorada (lo mas probable es destruirlo) o roja (tu unidad puede caer). */
export type BadgeTone = 'plain' | 'gold' | 'danger';

export interface BadgeLook {
  /** El numero en grande («−45»). */
  text: string;
  tone: BadgeTone;
  /** Probabilidad de que caiga (0 a 1), si se dice; null si es casi nula. */
  death: number | null;
}

const minus = (damage: number): string => `−${Math.max(0, Math.round(damage))}`;
const deathOf = (chance: number): number | null => (chance >= MENTION_DEATH ? chance : null);

/** La chapa sobre el enemigo: el daño esperado. */
export function damageBadge(forecast: ForecastVM): BadgeLook {
  const tone = forecast.killChance >= LIKELY_KILL ? 'gold' : 'plain';
  return { text: minus(forecast.expected), tone, death: deathOf(forecast.killChance) };
}

/**
 * La chapa sobre tu unidad: lo que te devuelve (lo esperado), o null si no contraataca o lo esperado
 * no llega a 1 (si lo mas probable es destruirlo, apenas devuelve nada: «−0» solo despistaria).
 */
export function counterBadge(forecast: ForecastVM): BadgeLook | null {
  const { counter } = forecast;
  if (!counter || Math.round(counter.lifeBefore - counter.lifeAfter) < 1) return null;
  const tone = counter.killChance >= RISKY_COUNTER ? 'danger' : 'plain';
  return { text: `↩ ${minus(counter.lifeBefore - counter.lifeAfter)}`, tone, death: deathOf(counter.killChance) };
}
