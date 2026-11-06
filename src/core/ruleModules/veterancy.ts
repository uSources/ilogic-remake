/**
 * [CAMBIO] Veterania (ajuste `veterancy`): las unidades que destruyen enemigos suben de rango, y cada
 * rango da +vetBonus de acierto al atacar y -vetBonus al que le ataca. Las bajas se cuentan siempre
 * (el combate: COMBAT_RESOLUTION); lo que enchufa el ajuste es que el rango cuente al apuntar.
 */
import type { GameState, Unit } from '../model';
import type { Engagement } from '../rules/engagement';
import type { RuleModule } from './hooks';

/** Bajas necesarias para cada rango (1, 2 y 3 estrellas). */
export const RANK_KILLS = [1, 3, 6] as const;

/** Rango de veterania de una unidad: 0 a 3. */
export function rank(unit: Unit): number {
  const kills = unit.kills ?? 0;
  return RANK_KILLS.filter((needed) => kills >= needed).length;
}

/** Lo que cambia el acierto por el rango de los dos (premia conservar las unidades que ya han destruido a alguien). */
function veterancyFactor(s: GameState, { attacker, defender }: Engagement): number {
  return (1 + s.settings.vetBonus * rank(attacker.unit)) * (1 - s.settings.vetBonus * rank(defender.unit));
}

export const VETERANCY: RuleModule = {
  id: 'veterancy',
  isOn: (settings) => settings.veterancy,
  hooks: { hitModifiers: [{ id: 'veterancy', factor: veterancyFactor }] },
};
