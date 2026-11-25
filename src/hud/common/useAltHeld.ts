import { useSyncExternalStore } from 'preact/compat';
import { trackAltKey } from './altKey';

/** La cuenta de Alt de la pagina, desde que carga la interfaz (asi la primera ficha ya lo sabe). */
const pageAlt = trackAltKey(window);

// Funciones fijas (no flechas nuevas en cada pintado): asi no se da de baja y de alta cada vez.
const subscribe = (listener: () => void) => pageAlt.subscribe(listener);
const snapshot = () => pageAlt.isHeld();

/** Alt pulsado (la ficha de la casilla y la prevision de combate enseñan entonces todo). */
export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribe, snapshot);
}
