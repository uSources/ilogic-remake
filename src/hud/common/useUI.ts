import { useSyncExternalStore } from 'preact/compat';
import { ui } from '../store';
import type { UIState } from '../state';

// Funciones fijas (no flechas nuevas en cada pintado): asi no se da de baja y de alta en el store cada vez.
const subscribe = (listener: () => void) => ui.subscribe(listener);
const snapshot = () => ui.get();

/** Estado de la interfaz; el componente se repinta cuando una escena hace ui.set(...). */
export function useUI(): UIState {
  return useSyncExternalStore(subscribe, snapshot);
}
