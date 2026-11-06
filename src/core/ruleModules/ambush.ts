/**
 * [CAMBIO] Emboscadas (ajuste `ambush`): los enemigos que el equipo de quien se mueve no ve no
 * cuentan al calcular por donde va (asi el alcance no delata donde estan). Si el camino choca con
 * uno, se para antes y pierde el turno (`PATH_INTERRUPTIONS`, rules/traverse.ts).
 */
import { areEnemies } from '../util/predicates';
import type { RuleModule } from './hooks';

export const AMBUSH: RuleModule = {
  id: 'ambush',
  isOn: (settings) => settings.ambush,
  hooks: {
    passRules: [
      { id: 'unseenFoes', passage: ({ s, mover, sees }, other) => (areEnemies(s, other, mover) && !sees(other) ? 'unnoticed' : null) },
    ],
  },
};
