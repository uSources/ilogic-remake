/** [CAMBIO] Flanqueo (ajuste `flankBonus`, 0 = sin flanqueo): rematar a quien ya ha recibido un ataque hoy es mas facil. */
import type { Engagement, GameState, Unit } from '../model';
import { wasHitToday } from '../util/predicates';
import type { RuleModule } from './hooks';
import { isRuleOn } from './ruleset';

/** Cuanto acierto de mas da atacar a `target` ahora (0 si la partida no lleva flanqueo o no le han atacado hoy). */
export function flankBonusFor(s: GameState, target: Unit): number {
  return isRuleOn(s, 'flank') && wasHitToday(s, target) ? s.settings.flankBonus : 0;
}

/** Premia atacar en grupo al mismo objetivo. */
function flankFactor(s: GameState, { defender }: Engagement): number {
  return 1 + flankBonusFor(s, defender.unit);
}

export const FLANK: RuleModule = {
  id: 'flank',
  isOn: (settings) => settings.flankBonus > 0,
  hooks: { hitModifiers: [{ id: 'flank', factor: flankFactor }] },
};
