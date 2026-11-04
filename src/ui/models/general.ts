import { abilityBlock, chargeStars, generalOf, type AbilityBlock } from '../../core/generals';
import type { GameState, Team } from '../../core/model';
import type { GeneralVM } from '../../hud/store';
import { settings, t, type TextKey } from '../../settings';

const BLOCK_TEXT: Partial<Record<AbilityBlock, TextKey>> = { used: 'genUsed', charge: 'genCharge' };

/** Panel del general de un bando (null si no tiene). `targeting`: habilidad que se esta apuntando. */
export function generalVM(s: GameState, team: Team, targeting: string | null): GeneralVM | null {
  const g = generalOf(s, team);
  if (!g) return null;
  const lang = settings.lang;
  const stars = chargeStars(g.state);
  return {
    face: `ui/gen_${team === 0 ? 'b' : 'r'}_${g.def.id}`,
    name: g.def.name[lang],
    title: g.def.title[lang],
    description: g.def.description[lang],
    stars,
    max: g.def.charge.max,
    fraction: stars >= g.def.charge.max ? 0 : g.state.charge - stars,
    targeting,
    abilities: g.def.abilities.map((a) => {
      // 'target' solo dice que falta elegir casilla: se puede usar.
      const block = abilityBlock(s, team, a.id, { x: 0, y: 0 });
      const text = block ? BLOCK_TEXT[block] : undefined;
      return {
        id: a.id,
        icon: `ui/ab_${a.id}`,
        name: a.name[lang],
        description: a.description[lang],
        cost: a.cost,
        ready: block === null,
        reason: text ? t(text) : null,
      };
    }),
  };
}
