/**
 * Fase 'target': elegir una casilla en el mapa para una orden con destino (Orders.ordering) o para
 * la habilidad del general que se apunta (GeneralAbilities.targeting).
 */

import { posKey } from '../../../core/geom';
import { markTiles, markUnits, type PhaseHandler } from './phase';

export const targetPhase: PhaseHandler = {
  accept: (host) => {
    const cursor = host.view.cursor;
    if (host.orders.ordering) return void host.orders.place(cursor);
    void host.abilities.fire(cursor);
  },
  back: (host) => {
    const fromUnitMenu = !!host.orders.ordering?.single;
    host.orders.ordering = null;
    // Desde el menu de la unidad: vuelve a el (su movimiento sigue a medio decidir).
    if (fromUnitMenu) return host.enter('unitMenu');
    host.toMap();
  },
  highlights: (input) => {
    if (input.orderingUids) return markUnits(input.s, input.orderingUids);
    return markTiles(input.targetArea(input.cursor).map(posKey), 'attack');
  },
};
