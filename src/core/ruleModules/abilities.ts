/**
 * [CAMBIO] Las habilidades de las unidades (ajuste `abilities`): lo que aporta cada clase
 * (ABILITY_EFFECTS, core/abilities.ts), todo junto en el orden de ABILITY_EFFECT_ORDER, si la
 * partida las tiene.
 */
import { ABILITY_EFFECT_ORDER, ABILITY_EFFECTS } from '../abilities';
import type { AbilityDef, UnitType } from '../content';
import type { GameState } from '../model';
import type { DeepReadonly } from '../util/freeze';
import type { RuleModule } from './hooks';
import { mergeHooks } from './mergeHooks';

export const ABILITIES: RuleModule = {
  id: 'abilities',
  isOn: (settings) => settings.abilities,
  hooks: mergeHooks(ABILITY_EFFECT_ORDER.map((kind) => ABILITY_EFFECTS[kind])),
};

/** Las habilidades de un tipo de unidad que cuentan en esta partida (para enseñarlas). */
export function abilitiesOf(s: GameState, unitType: UnitType): readonly DeepReadonly<AbilityDef>[] {
  return ABILITIES.isOn(s.settings) ? unitType.abilities : [];
}
