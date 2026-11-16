/**
 * Los textos de los menus de la partida 3D: el de la unidad (sus acciones, con «Atras» en su sitio) y
 * el de compra (precio y datos de cada unidad), y lo que cobra un equipo cada dia (la barra de arriba).
 */
import { buildingIncome, buildingsOf, upkeepOf, type BuyOption } from '../../../core/rules';
import { buildingTypeOf } from '../../../core/gameContent';
import type { UnitMenuOption } from '../../../core/actions';
import type { GameState, TeamId, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { nameOf, t, type TextKey } from '../../../settings';
import { abilitiesVM, buyBlockedText, captureHintText, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';

/** Una opcion del menu de la unidad: las del nucleo y «Atras». */
export type ActionKey = UnitMenuOption | 'back';
/** «Atras» va justo antes de esta opcion (la de peligro, al final), o al final si no esta. */
const BACK_GOES_BEFORE: UnitMenuOption = 'delete';

/** Las opciones del nucleo, en su orden, con «Atras» en su sitio (BACK_GOES_BEFORE). */
export function withBack(options: readonly UnitMenuOption[]): ActionKey[] {
  const at = options.indexOf(BACK_GOES_BEFORE);
  const cut = at < 0 ? options.length : at;
  return [...options.slice(0, cut), 'back', ...options.slice(cut)];
}

/** Las opciones del menu de la unidad, con su texto. */
export function unitMenuItems(s: GameState, unit: Unit | null, actions: readonly ActionKey[]): MenuItemVM[] {
  return actions.map((action) => ({
    id: action,
    label: t(action as TextKey),
    danger: action === 'delete',
    // "20→10": puntos del edificio antes y despues de capturar este turno (reglas nuevas).
    hint: action === 'capture' && unit ? captureHintText(s, unit) : undefined,
  }));
}

/** Una unidad que se puede comprar: precio y, al señalarla, sus datos (y por que no, si no se puede). */
export function buyItem(s: GameState, option: BuyOption): MenuItemVM {
  return {
    id: `buy${option.unitType.id}`,
    label: nameOf(option.unitType),
    hint: `${option.cost}`,
    icon: unitIconKey(option.unitType, option.affordable),
    disabled: !option.affordable,
    detail: buyDetail(s, option),
  };
}

function buyDetail(s: GameState, option: BuyOption): string {
  const { unitType } = option;
  const command = s.settings.commandPoints === null ? '' : ` · ${t('commandShort')} ${unitType.command}`;
  const abilities = abilitiesVM(s, unitType)
    .map((ability) => ` · ${ability.name}`)
    .join('');
  const blocked = option.blocked ? ` · ${buyBlockedText(s, option.blocked)}` : '';
  return `${unitStatsText(unitType)} · ${t('vision')} ${unitType.vision}${command}${abilities}${blocked}`;
}

/** Lo que cobra un equipo cada dia: sus edificios menos el mantenimiento de su ejercito. */
export function teamIncome(s: GameState, team: TeamId): number {
  const owned = buildingsOf(s, team);
  return owned.reduce((sum, building) => sum + buildingIncome(s, buildingTypeOf(s, building)), 0) - upkeepOf(s, team);
}
