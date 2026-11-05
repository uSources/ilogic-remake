import type { Pos } from './geometry';

/**
 * El ultimo movimiento de una partida, mientras se puede deshacer (la accion 'undoMove'): que unidad
 * se movio y desde donde. Solo vale hasta la accion siguiente, sea cual sea, y hasta el fin de ronda:
 * deshacer no puede servir para mirar con una unidad y volver despues de haber hecho otra cosa.
 */
export interface LastMove {
  uid: number;
  from: Pos;
}
