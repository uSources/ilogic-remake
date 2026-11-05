import { powerBlock, chargeStars, generalOf, type PowerBlock } from '../../core/generals';
import type { GameState, TeamId } from '../../core/model';
import type { GeneralVM } from '../../hud/store';
import { sideLetter, sideOf } from '../sides';
import { settings, t, type TextKey } from '../../settings';

const BLOCK_TEXT: Partial<Record<PowerBlock, TextKey>> = { used: 'genUsed', charge: 'genCharge' };

/**
 * Panel del general de un equipo para el que mira (`viewer`: su color en la cara), o null si no tiene.
 * `targeting`: poder que se esta apuntando.
 */
export function generalVM(s: GameState, viewer: TeamId, team: TeamId, targeting: string | null): GeneralVM | null {
  const general = generalOf(s, team);
  if (!general) return null;
  const lang = settings.lang;
  const stars = chargeStars(general.state);
  return {
    face: `ui/gen_${sideLetter(sideOf(s, viewer, team))}_${general.definition.id}`,
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
