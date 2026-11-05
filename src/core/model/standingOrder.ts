import type { Pos } from './geometry';

/**
 * [CAMBIO] Orden permanente (con destino) de una unidad, estilo RTS (de cualquier equipo; la da
 * quien lo juega): la cumple sola al terminar cada turno (ver ai/standingOrders.ts). Tipos:
 * - attack: avanza hacia `at` atacando lo que tenga a tiro por el camino; al llegar, cuando no
 *   quedan enemigos cerca, la orden se cumple;
 * - capture: va al edificio de `at` y lo captura (responde si puede, sin desviarse); cumplida al
 *   ser suyo;
 * - defend: va a `at` y la guarda (solo ataca a quien se acerque); no se cumple nunca, dura hasta
 *   que se cancela.
 * Al cumplirse, la unidad se queda quieta esperando otra orden.
 */
export type StandingOrderKind = 'attack' | 'capture' | 'defend';
export interface StandingOrder {
  kind: StandingOrderKind;
  at: Pos;
}
