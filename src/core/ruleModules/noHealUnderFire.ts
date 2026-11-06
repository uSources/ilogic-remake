/** [CAMBIO] Sin cura bajo fuego (ajuste `noHealUnderFire`): quien ha recibido un ataque hoy no se recupera esta noche. */
import type { RuleModule } from './hooks';

export const NO_HEAL_UNDER_FIRE: RuleModule = {
  id: 'noHealUnderFire',
  isOn: (settings) => settings.noHealUnderFire,
  hooks: { healingBlocks: [{ id: 'underFire', blocks: (s, unit) => unit.hitDay === s.day }] },
};
