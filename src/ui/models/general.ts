import { powerBlock, chargeStars, generalOf, type PowerBlock } from '../../core/generals';
import type { GameState, Team } from '../../core/model';
import type { GeneralVM } from '../../hud/store';
import { settings, t, type TextKey } from '../../settings';

const BLOCK_TEXT: Partial<Record<PowerBlock, TextKey>> = { used: 'genUsed', charge: 'genCharge' };

/** Panel del general de un bando (null si no tiene). `targeting`: poder que se esta apuntando. */
export function generalVM(s: GameState, team: Team, targeting: string | null): GeneralVM | null {
  const general = generalOf(s, team);
  if (!general) return null;
  const lang = settings.lang;
  const stars = chargeStars(general.state);
  return {
    face: `ui/gen_${team === 0 ? 'b' : 'r'}_${general.definition.id}`,
    name: general.definition.name[lang],
    title: general.definition.title[lang],
    description: general.definition.description[lang],
    stars,
    max: general.definition.charge.max,
    fraction: stars >= general.definition.charge.max ? 0 : general.state.charge - stars,
    targeting,
    powers: general.definition.powers.map((power) => {
      // 'target' solo dice que falta elegir casilla: se puede usar.
      const block = powerBlock(s, team, power.id, { x: 0, y: 0 });
      const text = block ? BLOCK_TEXT[block] : undefined;
      return {
        id: power.id,
        icon: `ui/ab_${power.id}`,
        name: power.name[lang],
        description: power.description[lang],
        cost: power.cost,
        ready: block === null,
        reason: text ? t(text) : null,
      };
    }),
  };
}
