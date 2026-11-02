/**
 * El teclado entre el navegador y Phaser. Tab es del juego ("siguiente unidad" en el mapa, "siguiente"
 * en la pantalla final), asi que el navegador no debe usarlo para mover el foco por los botones.
 *
 * Ojo con el orden: Phaser no mira las pulsaciones que ya llegan con `defaultPrevented`
 * (KeyboardManager.onKeyDown). Por eso Phaser escucha en `document` (config `input.keyboard.target`,
 * main.ts) y el guardian de Tab en `window` en fase de burbuja, que va despues.
 * En fase de captura, o en `document` antes que Phaser, Tab no llegaria nunca al juego. Un cuadro de
 * texto que corte la propagacion (nombre de escuadra) tiene que frenar Tab el mismo.
 */

/** Tab (con o sin Mayusculas) no mueve el foco del navegador; la pulsacion sigue llegando al juego. */
export function blockTabFocus(e: Pick<KeyboardEvent, 'key' | 'preventDefault'>): void {
  if (e.key === 'Tab') e.preventDefault();
}

/** Pone el guardian de Tab en `win` (fase de burbuja: despues de que Phaser haya visto la tecla). */
export function installTabGuard(win: Pick<EventTarget, 'addEventListener'>): void {
  win.addEventListener('keydown', (e) => blockTabFocus(e as KeyboardEvent), { capture: false });
}
