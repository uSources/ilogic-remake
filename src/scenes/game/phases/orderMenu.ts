/**
 * [CAMBIO] Fase 'orderMenu': las acciones que valen en una casilla con la unidad o el grupo elegido
 * (clic derecho, pulsacion larga o F en el destino; ver Orders.openMenu).
 */
import { actionById } from '../../../controls/actions';
import { t, type TextKey } from '../../../settings';
import { markUnits, noHighlights, type PhaseHandler } from './phase';

export const orderMenuPhase: PhaseHandler = {
  accept: (h) => void h.orders.acceptMenu(),
  back: (h) => {
    // Vuelve a donde estaba: la unidad elegida (moviendo o en su menu) o el grupo.
    const from = h.orders.menu?.from;
    h.orders.menu = null;
    const unit = h.moves.selected;
    if (from === 'move' && unit) return h.moves.select(unit);
    if (from === 'unitMenu' && unit) return h.enter('unitMenu');
    h.toMap();
  },
  menu: (input) => {
    const menu = input.orderMenu;
    const items = (menu?.ids ?? []).map((id) => ({ id, label: t(actionById(id)!.label as TextKey) }));
    if (!menu) return { kind: 'unit', items, at: input.cursor };
    const title = menu.uids.length > 1 ? `${t('orderUnit')} · ${menu.uids.length}` : t('orderUnit');
    return { kind: 'unit', title, items, at: menu.at };
  },
  highlights: (input) => (input.orderMenuUids ? markUnits(input.s, input.orderMenuUids) : noHighlights()),
};
