/** [CAMBIO] Las habilidades de las unidades (ajuste `abilities`; core/abilities.ts) se enchufan a las reglas desde aqui. */
import { defenseFactor, piercingOf } from '../abilities';
import type { RuleModule } from './hooks';

export const ABILITIES: RuleModule = {
  id: 'abilities',
  isOn: (settings) => settings.abilities,
  hooks: {
    // Escudo del defensor contra disparos a distancia y aura de sus aliados: hacen fuertes a los grupos.
    hitModifiers: [{ id: 'abilities', factor: defenseFactor }],
    coverPiercing: [{ id: 'piercing', ignoredCover: piercingOf }],
  },
};
