/**
 * El teclado entre el navegador y Phaser. Tab es del juego ("siguiente unidad" en el mapa, "siguiente"
 * en la pantalla final), asi que el navegador no debe usarlo para mover el foco por los botones.
 *
 * Ojo con el orden: Phaser no mira las pulsaciones que ya llegan con `defaultPrevented`
 * (KeyboardManager.onKeyDown). Por eso Phaser escucha en `document` (config `input.keyboard.target`,
 * main.ts) y el guardian de Tab en `window` en fase de burbuja, que va despues.
 * En fase de captura, o en `document` antes que Phaser, Tab no llegaria nunca al juego. Un cuadro de
 * texto que corte la propagacion (nombre de escuadra) tiene que frenar Tab el mismo.
 *
 * Y Phaser reparte la misma pulsacion varias veces: guarda las del fotograma en una cola y, con cada
 * una nueva, vuelve a repartir la cola entera (KeyboardPlugin.update en cada MANAGER_PROCESS; solo se
 * salta la repetida justo antes, y la cola se vacia al acabar el fotograma). Por eso quien escucha las
 * teclas de una escena lo hace con `onceEachKey`.
 */

/** Tab (con o sin Mayusculas) no mueve el foco del navegador; la pulsacion sigue llegando al juego. */
export function blockTabFocus(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): void {
  if (event.key === 'Tab') event.preventDefault();
}

/**
 * El manejador de teclas de una escena, que atiende cada pulsacion una sola vez aunque Phaser la
 * reparta de nuevo. Mayusculas+Tab con sus cuatro eventos en un fotograma (pulsar Mayusculas, pulsar
 * Tab, soltar Tab, soltar Mayusculas) daba el Tab tres veces: en la pantalla final, con tres botones,
 * se volvia al mismo; en el mapa, saltaba tres unidades. Igual dos flechas muy seguidas.
 */
export function onceEachKey<KeyEvent extends object>(handle: (event: KeyEvent) => void): (event: KeyEvent) => void {
  const handled = new WeakSet<KeyEvent>();
  return (event) => {
    if (handled.has(event)) return;
    handled.add(event);
    handle(event);
  };
}

/** Pone el guardian de Tab en `win` (fase de burbuja: despues de que Phaser haya visto la tecla). */
export function installTabGuard(win: Pick<EventTarget, 'addEventListener'>): void {
  win.addEventListener('keydown', (event) => blockTabFocus(event as KeyboardEvent), { capture: false });
}
