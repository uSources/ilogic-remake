import { settings } from '../settings';

/**
 * Menos movimiento: solo si se pide en Opciones. [CAMBIO] Antes tambien se hacia caso a la
 * preferencia del sistema, pero en Windows con "efectos de animacion" apagados el agua, las nubes
 * y el fondo del menu se quedaban quietos sin que el jugador supiera por que.
 */
export const reducedMotion = (): boolean => settings.reduceMotion || frozen;

/** Todo quieto y sin azar visual (capturas de referencia, src/debug.ts). No se guarda. */
let frozen = false;
export function setFrozen(on: boolean): void {
  frozen = on;
}
