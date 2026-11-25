/**
 * Si Alt esta pulsado, una sola cuenta para toda la pagina (la ficha de la casilla y la prevision de
 * combate enseñan entonces todo). Va aparte de los componentes porque estos se montan a menudo (cada
 * casilla distinta, cada prevision) y en Mac mantener Alt no repite la pulsacion: una ficha que
 * guardara su propio estado empezaria sin Alt aunque se este pulsando.
 */

/** Lo que se sabe de Alt y quien quiere enterarse cuando cambia. */
export interface AltKey {
  isHeld(): boolean;
  /** Avisa de cada cambio; devuelve como darse de baja. */
  subscribe(listener: () => void): () => void;
}

/**
 * Sucesos que dicen como esta Alt: las teclas y tambien el raton, por si se perdio la pulsacion
 * (Alt pulsado con la pagina sin el foco: al mover el raton se corrige).
 */
const ALT_EVENTS = ['keydown', 'keyup', 'pointermove', 'pointerdown'] as const;

/** En fase de captura: un cuadro de texto que corte la propagacion (nombre de escuadra) no esconde la suelta de Alt. */
const BEFORE_ANYONE = { capture: true };

const altOf = (event: Event): boolean => 'altKey' in event && event.altKey === true;

/** Empieza a seguir Alt en `win` (la ventana del juego). */
export function trackAltKey(win: Pick<EventTarget, 'addEventListener'>): AltKey {
  let isHeld = false;
  const listeners = new Set<() => void>();
  const setHeld = (held: boolean) => {
    if (held === isHeld) return;
    isHeld = held;
    listeners.forEach((listener) => listener());
  };
  for (const type of ALT_EVENTS) win.addEventListener(type, (event) => setHeld(altOf(event)), BEFORE_ANYONE);
  // Al salir de la ventana (Cmd+Tab con Alt pulsado) no llega la suelta.
  win.addEventListener('blur', () => setHeld(false));
  return {
    isHeld: () => isHeld,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
