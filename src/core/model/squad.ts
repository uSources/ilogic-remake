import type { TurnEndOrder } from './standingOrder';
import type { TeamId } from './team';

/**
 * [CAMBIO] Escuadra con nombre: varias unidades de un equipo que reciben las ordenes juntas.
 * La orden de la escuadra la siguen todas sus unidades salvo las destacadas, que llevan una orden
 * propia (Unit.standingOrder) y al cumplirla vuelven a la de la escuadra (ver effectiveStandingOrder).
 */
export interface Squad {
  id: number;
  /** El equipo de sus unidades (solo las de ese equipo pueden entrar). */
  team: TeamId;
  name: string;
  /** Orden de toda la escuadra. */
  standingOrder?: TurnEndOrder;
  /** Tecla del grupo (1-9) en su equipo, como Ctrl+1 en los juegos de estrategia en tiempo real. */
  key?: number;
}
