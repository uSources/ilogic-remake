/**
 * [CAMBIO] Fase 'groupMenu': que hacer con varias unidades elegidas (recuadro, «Elegir varias»,
 * escuadra). Las opciones son las acciones sin casilla del registro (controls/actions.ts); las
 * ordenes piden despues el destino.
 */
import { actionById, menuActions, type ActionId } from '../../../controls/actions';
import { showToast, type MenuItemVM } from '../../../hud/store';
import { t, type TextKey } from '../../../settings';
import type { MenuModel } from '../menuModel';
import type { PhaseHandler } from './phase';

export const groupMenuPhase: PhaseHandler = {
  enter: (h) => {
    h.selection.multi = false;
    h.menuSel = 0;
    h.phase = 'groupMenu';
    h.refresh();
  },
  accept: (h) => {
    const choice = h.menuItems[h.menuSel]?.id;
    if (choice === 'move') {
      // Sigue elegido: el clic derecho (o Enter) en el destino lo mueve.
      showToast(`${h.selection.groupUnits().length} ${t('groupSelected')}`);
      return h.toMap();
    }
    if (!choice || choice === 'cancel' || !actionById(choice)) return h.toMap();
    void h.orders.run(choice as ActionId, null, { queue: false, single: false });
  },
  // Atras deja el grupo elegido: el siguiente clic en el mapa lo mueve.
  back: (h) => h.toMap(),
  menu: (input) => {
    const units = input.groupUnits();
    const ctx = input.groupCtx();
    const actions = ctx ? menuActions(ctx) : [];
    const items: MenuItemVM[] = [
      // "Mover" deja el grupo elegido para el clic derecho.
      { id: 'move', label: t('groupMoveHint') },
      ...actions.map((action) => ({ id: action.id, label: t(action.label as TextKey) })),
      { id: 'cancel', label: t('cancel') },
    ];
    const model: MenuModel = { kind: 'unit', title: `${t('groupMenu')} · ${units.length}`, items, at: units[0] ?? input.cursor };
    return model;
  },
};
