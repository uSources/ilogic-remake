/** Fase 'buy': el menu de compra de una fabrica propia. */
import { tablesOf } from '../../../core/gameContent';
import { buyOptions, spawn, type BuyOption } from '../../../core/rules';
import type { Building, GameState } from '../../../core/model';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { buildingLabel, fmtNum, t, unitLabel } from '../../../settings';
import { abilitiesVM, buyBlockedText, unitStatsText } from '../../../ui/hudModels';
import { unitIconKey } from '../../../ui/sprites';
import type { MenuModel } from '../menuModel';
import type { PhaseHandler, PhaseHost } from './phase';
import { posOf } from '../../../core/geom';

/** La primera opcion del menu es «Cancelar»; las unidades van detras. */
const CANCEL_ROW = 0;

/** Abrir la compra en una fabrica, señalando la primera unidad que se puede pagar. */
export function openBuy(h: PhaseHost, building: Building): void {
  h.buyAt = building;
  h.buyOptions = buyOptions(h.state, building);
  const firstAffordable = h.buyOptions.findIndex((option) => option.affordable);
  h.menuSel = firstAffordable >= 0 ? firstAffordable + 1 : CANCEL_ROW;
  h.phase = 'buy';
  h.refresh();
}

export const buyPhase: PhaseHandler = {
  accept: (h) => {
    const building = h.buyAt;
    if (h.menuSel === CANCEL_ROW || !building) return h.toMap();
    const option = h.buyOptions[h.menuSel - 1];
    if (!option) return;
    if (option.blocked) return showToast(buyBlockedText(h.state, option.blocked));
    const unit = spawn(h.state, building, option.type);
    if (unit) void h.play([{ kind: 'spawn', uid: unit.uid, at: posOf(building) }]).then(() => h.afterAction());
  },
  back: (h) => h.toMap(),
  menu: (input) => {
    const building = input.building;
    const items: MenuItemVM[] = [{ id: 'cancel', label: t('cancel'), icon: null }, ...input.buy.map((option) => buyItem(input.s, option))];
    const model: MenuModel = { kind: 'buy', items, at: input.cursor };
    if (!building) return model;
    const subtitle = `${t('funds')}: ${fmtNum(input.s.funds[0])}`;
    return { ...model, at: building, title: buildingLabel(input.s.content, building.type), subtitle };
  },
};

/** Una unidad que se puede comprar: precio y, al señalarla, sus datos (y por que no, si no se puede). */
function buyItem(s: GameState, option: BuyOption): MenuItemVM {
  return {
    id: `buy${option.type}`,
    label: unitLabel(s.content, option.type),
    hint: `${option.cost}`,
    icon: unitIconKey(s, option.type, option.affordable),
    disabled: !option.affordable,
    detail: buyDetail(s, option),
  };
}

function buyDetail(s: GameState, option: BuyOption): string {
  const type = option.type;
  const UNIT = tablesOf(s).UNIT;
  const command = s.rules.commandPoints === null ? '' : ` · ${t('commandShort')} ${UNIT.command[type]}`;
  const abilities = abilitiesVM(s, type)
    .map((ability) => ` · ${ability.name}`)
    .join('');
  const blocked = option.blocked ? ` · ${buyBlockedText(s, option.blocked)}` : '';
  return `${unitStatsText(s, type)} · ${t('vision')} ${UNIT.vision[type]}${command}${abilities}${blocked}`;
}
