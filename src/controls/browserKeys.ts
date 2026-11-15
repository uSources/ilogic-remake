/**
 * El teclado entre el navegador y el juego. Tab es del juego ("siguiente unidad" en el mapa,
 * "siguiente" en la pantalla final), asi que el navegador no debe usarlo para mover el foco por los
 * botones. El guardian va en `window` en fase de burbuja: quien escucha las teclas del juego no mira
 * si ya llegan con `defaultPrevented`. Un cuadro de texto que corte la propagacion (nombre de
 * escuadra) tiene que frenar Tab el mismo.
 */

/** Tab (con o sin Mayusculas) no mueve el foco del navegador; la pulsacion sigue llegando al juego. */
export function blockTabFocus(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): void {
  if (event.key === 'Tab') event.preventDefault();
}

/** Pone el guardian de Tab en `win` (fase de burbuja). */
export function installTabGuard(win: Pick<EventTarget, 'addEventListener'>): void {
  win.addEventListener('keydown', (event) => blockTabFocus(event as KeyboardEvent), { capture: false });
}
