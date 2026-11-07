import type { Pos } from './geometry';

/**
 * [CAMBIO] Orden permanente (con destino) de una unidad, estilo RTS (de cualquier equipo; la da
 * quien lo juega): la cumple sola cada turno (ver autopilot/standingOrders.ts), al acabarlo o, la de
 * ir, al empezarlo (`STANDING_ORDER_MOMENT`, squads/standingOrders.ts). Tipos:
 * - attack: avanza hacia `at` atacando lo que tenga a tiro por el camino; al llegar, cuando no
 *   quedan enemigos cerca, la orden se cumple;
 * - capture: va al edificio de `at` y lo captura (responde si puede, sin desviarse); cumplida al
 *   ser suyo;
 * - defend: va a `at` y la guarda (solo ataca a quien se acerque); no se cumple nunca, dura hasta
 *   que se cancela.
 * - goto: «Ir alli», un viaje de varios turnos: al empezar cada turno avanza sola hacia `at` (sin
 *   atacar ni capturar; lo demas lo hace quien juega) y acaba al llegar o cuando ya llega ese turno
 *   (el ultimo trozo lo hace quien juega). Es siempre de la unidad (nunca de su escuadra) y moverla
 *   a mano la acaba.
 * Al cumplirse, la unidad se queda quieta esperando otra orden.
 */
export type StandingOrderKind = TurnEndOrderKind | 'goto';
/** Las ordenes que se cumplen al acabar el turno (las de pelear: lo que se enseña como orden en el mapa). */
export type TurnEndOrderKind = 'attack' | 'capture' | 'defend';
/** Cuando cumple una unidad su orden en su turno: al empezarlo ('goto') o al acabarlo (las demas). */
export type StandingOrderMoment = 'turnStart' | 'turnEnd';
/** Una orden: que hacer (`kind`) y donde (`at`). */
export interface StandingOrder {
  kind: StandingOrderKind;
  at: Pos;
}

/** Una orden de pelear (las que se cumplen al acabar el turno; las unicas que puede tener una escuadra). */
export interface TurnEndOrder extends StandingOrder {
  kind: TurnEndOrderKind;
}
