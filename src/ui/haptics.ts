import { settings } from '../settings';

/**
 * Vibracion corta del movil (al coger, soltar y atacar con el dedo). Se puede quitar en Opciones.
 * Sin vibrador (ordenador, iPhone) no hace nada.
 */
export function buzz(ms: number): void {
  if (!settings.vibrate) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Algunos navegadores lo bloquean sin un gesto del usuario: no pasa nada.
  }
}
