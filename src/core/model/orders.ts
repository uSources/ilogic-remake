import type { Pos } from './geometry';

/**
 * [CAMBIO] Orden con destino de una unidad del jugador (estilo RTS), ver commandTurn en ai.ts:
 * - attack: avanza hacia `at` atacando lo que tenga a tiro por el camino; al llegar, cuando no
 *   quedan enemigos cerca, la orden se cumple;
 * - capture: va al edificio de `at` y lo captura (responde si puede, sin desviarse); cumplida al
 *   ser suyo;
 * - defend: va a `at` y la guarda (solo ataca a quien se acerque); no se cumple nunca, dura hasta
 *   que se cancela.
 * Al cumplirse, la unidad se queda quieta esperando otra orden.
 */
export type CommandKind = 'attack' | 'capture' | 'defend';
export interface Command {
  kind: CommandKind;
  at: Pos;
}

/**
 * [CAMBIO] Escuadra con nombre: varias unidades del jugador que reciben las ordenes juntas.
 * La orden de la escuadra la siguen todas sus unidades salvo las destacadas, que llevan una orden
 * propia (Unit.command) y al cumplirla vuelven a la de la escuadra (ver effectiveCommand).
 */
export interface Squad {
  id: number;
  name: string;
  /** Orden de toda la escuadra. */
  command?: Command;
  /** Tecla del grupo (1-9), como Ctrl+1 en los juegos de estrategia en tiempo real. */
  key?: number;
}
