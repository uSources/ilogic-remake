import { abilityBlock, chargeStars, generalOf, type AbilityBlock } from '../../core/generals';
import type { GameState, Team } from '../../core/model';
import type { GeneralVM } from '../../hud/store';
import { settings, t, type TextKey } from '../../settings';

const BLOCK_TEXT: Partial<Record<AbilityBlock, TextKey>> = { used: 'genUsed', charge: 'genCharge' };

/** Panel del general de un bando (null si no tiene). `targeting`: habilidad que se esta apuntando. */
export function generalVM(s: GameState, team: Team, targeting: string | null): GeneralVM | null {
  const general = generalOf(s, team);
  if (!general) return null;
  const lang = settings.lang;
  const stars = chargeStars(general.state);
  return {
    face: `ui/gen_${team === 0 ? 'b' : 'r'}_${general.def.id}`,
    name: general.def.name[lang],
    title: general.def.title[lang],
    description: general.def.description[lang],
    stars,
    max: general.def.charge.max,
    fraction: stars >= general.def.charge.max ? 0 : general.state.charge - stars,
    targeting,
    abilities: general.def.abilities.map((ability) => {
      // 'target' solo dice que falta elegir casilla: se puede usar.
      const block = abilityBlock(s, team, ability.id, { x: 0, y: 0 });
      const text = block ? BLOCK_TEXT[block] : undefined;
      return {
        id: ability.id,
        icon: `ui/ab_${ability.id}`,
        name: ability.name[lang],
        description: ability.description[lang],
        cost: ability.cost,
        ready: block === null,
        reason: text ? t(text) : null,
      };
    }),
  };
}
