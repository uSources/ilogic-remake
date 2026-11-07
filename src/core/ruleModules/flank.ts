/** [CAMBIO] Flanqueo (ajuste `flankBonus`, 0 = sin flanqueo): rematar a quien ya ha recibido un ataque hoy es mas facil. */
import type { Engagement, GameState, Unit } from '../model';
import { isHitToday } from '../rules/engagement';
import { wasHitToday } from '../util/predicates';
import type { RuleModule } from './hooks';
import { isRuleOn } from './ruleset';

/** Cuanto acierto de mas da atacar a quien ya han atacado hoy (0 si la partida no lleva flanqueo). */
const flankBonusOnceHit = (s: GameState): number => (isRuleOn(s, 'flank') ? s.settings.flankBonus : 0);

/** Cuanto acierto de mas da atacar a `target` ahora (0 si la partida no lleva flanqueo o no le han atacado hoy): lo enseña el panel de combate. */
export function flankBonusFor(s: GameState, target: Unit): number {
  return wasHitToday(s, target) ? flankBonusOnceHit(s) : 0;
}

/** Premia atacar en grupo al mismo objetivo (tambien en un combate hipotetico: `defenderHitToday`). */
function flankFactor(s: GameState, { defender }: Engagement): number {
  return isHitToday(s, defender) ? 1 + flankBonusOnceHit(s) : 1;
}

export const FLANK: RuleModule = {
  id: 'flank',
  isOn: (settings) => settings.flankBonus > 0,
  hooks: { hitModifiers: [{ id: 'flank', factor: flankFactor }] },
};
