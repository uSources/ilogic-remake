import { chargeStars, generalOf } from '../../core/generals';
import { powerBlock, type PowerBlock } from '../../core/generalPowers';
import type { GameState, TeamId } from '../../core/model';
import type { GeneralVM } from '../../hud/store';
import { sideLetter, sideOf } from '../sides';
import { settings, t, type TextKey } from '../../settings';

const BLOCK_TEXT: Partial<Record<PowerBlock, TextKey>> = { powerUsed: 'genUsed', charge: 'genCharge' };

/**
 * Panel del general de un equipo para el que mira (`viewer`: su color en la cara), o null si no tiene.
 * `targeting`: poder que se esta apuntando. `chargeKnown` false: la carga no se sabe (por la red, la
 * de los demas equipos no llega) y la barra lo enseña asi.
 */
export function generalVM(
  s: GameState,
  viewer: TeamId,
  team: TeamId,
  targeting: string | null,
  { chargeKnown = true }: { chargeKnown?: boolean } = {},
): GeneralVM | null {
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
    chargeKnown,
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
