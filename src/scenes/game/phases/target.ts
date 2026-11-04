/**
 * Fase 'target': elegir una casilla en el mapa para una orden con destino (Orders.ordering) o para
 * la habilidad del general que se apunta (GeneralAbilities.targeting).
 */

import { posKey } from '../../../core/geom';
import { markTiles, markUnits, type PhaseHandler } from './phase';

export const targetPhase: PhaseHandler = {
  accept: (h) => {
    const cursor = h.view.cursor;
    if (h.orders.ordering) return void h.orders.place(cursor);
    void h.abilities.fire(cursor);
  },
  back: (h) => {
    const fromUnitMenu = !!h.orders.ordering?.single;
    h.orders.ordering = null;
    // Desde el menu de la unidad: vuelve a el (su movimiento sigue a medio decidir).
    if (fromUnitMenu) return h.enter('unitMenu');
    h.toMap();
  },
  highlights: (input) => {
    if (input.orderingUids) return markUnits(input.s, input.orderingUids);
    return markTiles(input.targetArea(input.cursor).map(posKey), 'attack');
  },
};
