/**
 * El rango de veterania de una unidad, por las bajas que lleva (se cuentan siempre: COMBAT_RESOLUTION).
 * Lo enseñan el combate y la interfaz; que el rango cambie el acierto lo pone el modulo de veterania.
 */
import type { Unit } from '../model';

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;

/** Rango de veterania de una unidad: 0 a 3. */
export function rank(unit: Unit): number {
  const kills = unit.kills ?? 0;
  return RANK_KILLS.filter((needed) => kills >= needed).length;
}
