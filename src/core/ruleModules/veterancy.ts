/**
 * [CAMBIO] Veterania (ajuste `veterancy`): las unidades que destruyen enemigos suben de rango, y cada
 * rango (rules/rank.ts) da +vetBonus de acierto al atacar y -vetBonus al que le ataca. Las bajas se
 * cuentan siempre (el combate: COMBAT_RESOLUTION); lo que enchufa el ajuste es que el rango cuente al apuntar.
 */
import type { GameState } from '../model';
import { rank } from '../rules/rank';
import type { Engagement } from '../rules/engagement';
import type { RuleModule } from './hooks';

/** Lo que cambia el acierto por el rango de los dos (premia conservar las unidades que ya han destruido a alguien). */
function veterancyFactor(s: GameState, { attacker, defender }: Engagement): number {
  return (1 + s.settings.vetBonus * rank(attacker.unit)) * (1 - s.settings.vetBonus * rank(defender.unit));
}

export const VETERANCY: RuleModule = {
  id: 'veterancy',
  isOn: (settings) => settings.veterancy,
  hooks: { hitModifiers: [{ id: 'veterancy', factor: veterancyFactor }] },
};
