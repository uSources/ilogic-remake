/**
 * [CAMBIO] Contraataque (ajuste `counterattack`): el defensor que sobrevive responde si es una unidad
 * de cuerpo a cuerpo, el atacante tambien lo es y lo tiene a su alcance. La artilleria y demas
 * unidades a distancia ni contraatacan ni reciben contraataque.
 */
import type { Engagement, GameState } from '../model';
import { canDamage, inAttackRange } from '../rules/weapons';
import { isAlive, isRanged } from '../util/predicates';
import type { CounterRule, RuleModule } from './hooks';

/** Responde quien sigue vivo, de cuerpo a cuerpo contra uno de cuerpo a cuerpo, si le hace daño y lo tiene a tiro. */
function meleeCounters(s: GameState, { attacker, defender }: Engagement): boolean {
  if (!isAlive(defender) || isRanged(s, defender.unit) || isRanged(s, attacker.unit)) return false;
  return canDamage(s, defender.unit, attacker.unit) && inAttackRange(s, defender.unit, defender.at, attacker.at);
}

export const MELEE_COUNTER: CounterRule = { id: 'melee', allows: meleeCounters };

export const COUNTERATTACK: RuleModule = {
  id: 'counterattack',
  isOn: (settings) => settings.counterattack,
  hooks: { counterRules: [MELEE_COUNTER] },
};
