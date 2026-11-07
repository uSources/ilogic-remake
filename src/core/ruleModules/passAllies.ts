/** [CAMBIO] Pasar entre aliados (ajuste `passAllies`): se atraviesan las unidades propias y aliadas, sin terminar encima. */
import { areEnemies } from '../util/predicates';
import type { RuleModule } from './hooks';

export const PASS_ALLIES: RuleModule = {
  id: 'passAllies',
  isOn: (settings) => settings.passAllies,
  hooks: {
    passRules: [
      { id: 'allies', passage: ({ s, mover }, other) => (areEnemies(s, other, mover) ? null : 'passThrough'), allies: 'passThrough' },
    ],
  },
};
