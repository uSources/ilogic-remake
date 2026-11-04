import type { StandingOrder } from './standingOrder';

/**
 * [CAMBIO] Escuadra con nombre: varias unidades del jugador que reciben las ordenes juntas.
 * La orden de la escuadra la siguen todas sus unidades salvo las destacadas, que llevan una orden
 * propia (Unit.standingOrder) y al cumplirla vuelven a la de la escuadra (ver effectiveStandingOrder).
 */
export interface Squad {
  id: number;
  name: string;
  /** Orden de toda la escuadra. */
  standingOrder?: StandingOrder;
  /** Tecla del grupo (1-9), como Ctrl+1 en los juegos de estrategia en tiempo real. */
  key?: number;
}
