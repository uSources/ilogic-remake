/** Fase 'buy': el menu de compra de una fabrica propia. */
import { buildingTypeOf } from '../../../core/gameContent';
import { buyOptions, spawn, type BuyOption } from '../../../core/rules';
import type { Building, GameState } from '../../../core/model';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { nameOf, fmtNum, t } from '../../../settings';
import { abilitiesVM, buyBlockedText, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import type { MenuModel } from '../menuModel';
import type { PhaseHandler, PhaseHost } from './phase';
import { posOf } from '../../../core/geom';

/** La primera opcion del menu es «Cancelar»; las unidades van detras. */
const CANCEL_ROW = 0;

/** Abrir la compra en una fabrica, señalando la primera unidad que se puede pagar. */
export function openBuy(host: PhaseHost, building: Building): void {
  host.buyAt = building;
  host.buyOptions = buyOptions(host.state, building);
  const firstAffordable = host.buyOptions.findIndex((option) => option.affordable);
  host.menuSel = firstAffordable >= 0 ? firstAffordable + 1 : CANCEL_ROW;
  host.phase = 'buy';
  host.refresh();
}

export const buyPhase: PhaseHandler = {
  accept: (host) => {
    const building = host.buyAt;
    if (host.menuSel === CANCEL_ROW || !building) return host.toMap();
    const option = host.buyOptions[host.menuSel - 1];
    if (!option) return;
    if (option.blocked) return showToast(buyBlockedText(host.state, option.blocked));
    const unit = spawn(host.state, building, option.unitType);
    if (unit) void host.play([{ kind: 'spawn', uid: unit.uid, at: posOf(building) }]).then(() => host.afterAction());
  },
  back: (host) => host.toMap(),
  menu: (input) => {
    const building = input.building;
    const items: MenuItemVM[] = [{ id: 'cancel', label: t('cancel'), icon: null }, ...input.buy.map((option) => buyItem(input.s, option))];
    const model: MenuModel = { kind: 'buy', items, at: input.cursor };
    if (!building) return model;
    const subtitle = `${t('funds')}: ${fmtNum(input.s.funds[0])}`;
    return { ...model, at: building, title: nameOf(buildingTypeOf(input.s, building)), subtitle };
  },
};

/** Una unidad que se puede comprar: precio y, al señalarla, sus datos (y por que no, si no se puede). */
function buyItem(s: GameState, option: BuyOption): MenuItemVM {
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
  const command = s.rules.commandPoints === null ? '' : ` · ${t('commandShort')} ${unitType.command}`;
  const abilities = abilitiesVM(s, unitType)
    .map((ability) => ` · ${ability.name}`)
    .join('');
  const blocked = option.blocked ? ` · ${buyBlockedText(s, option.blocked)}` : '';
  return `${unitStatsText(unitType)} · ${t('vision')} ${unitType.vision}${command}${abilities}${blocked}`;
}
