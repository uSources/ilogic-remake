/**
 * Los textos de los menus de la partida 3D: la barra de la unidad (sus acciones) y
 * el de compra (precio y datos de cada unidad), y lo que cobra un equipo cada dia (la barra de arriba).
 */
import { buildingIncome, buildingsOf, upkeepOf, type BuyOption } from '../../../core/rules';
import { buildingTypeOf } from '../../../core/gameContent';
import type { GameState, TeamId, Unit } from '../../../core/model';
import type { MenuItemVM } from '../../../hud/store';
import { nameOf, t, type TextKey } from '../../../settings';
import { abilitiesVM, buyBlockedText, captureHintText, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import type { BarOption } from './unitBar';

/** La barra de acciones de la unidad, con su texto (en capturar, "20→10": puntos del edificio antes y despues). */
export function barItems(s: GameState, unit: Unit, options: readonly BarOption[]): MenuItemVM[] {
  return options.map((option) => ({
    id: option,
    label: t(option as TextKey),
    danger: option === 'delete',
    hint: option === 'capture' ? captureHintText(s, unit) : undefined,
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
