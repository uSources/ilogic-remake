/** [CAMBIO] Flanqueo (ajuste `flankBonus`, 0 = sin flanqueo): rematar a quien ya ha recibido un ataque hoy es mas facil. */
import type { GameState, Unit } from '../model';
import type { Engagement } from '../rules/engagement';
import type { RuleModule } from './hooks';

/** La unidad ya ha recibido un ataque hoy y la partida tiene flanqueo. */
export function flanked(s: GameState, defender: Unit): boolean {
  return s.settings.flankBonus > 0 && defender.hitDay === s.day;
}

/** Premia atacar en grupo al mismo objetivo. */
function flankFactor(s: GameState, { defender }: Engagement): number {
  return flanked(s, defender.unit) ? 1 + s.settings.flankBonus : 1;
}

export const FLANK: RuleModule = {
  id: 'flank',
  isOn: (settings) => settings.flankBonus > 0,
  hooks: { hitModifiers: [{ id: 'flank', factor: flankFactor }] },
};
