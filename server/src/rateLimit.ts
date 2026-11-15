/**
 * Frenar a quien insiste: la sala cuenta cuantos mensajes le ha rechazado a cada asiento
 * (`rejectionsOf`), y aqui se mira cuantos han sido en la ultima ventana de tiempo. Pasado el tope,
 * el servidor le corta la conexion (puede volver a entrar con su ficha: no es un castigo, es que un
 * cliente roto o alguien probando no tenga al servidor contestando errores sin parar).
 */
import { MAX_REJECTIONS_PER_WINDOW, REJECTION_WINDOW_MS } from './limits';

/** Una ventana: cuando empezo y cuantos rechazos llevaba el asiento al empezar. */
export interface RejectionWindow {
  since: number;
  countAtStart: number;
}

/** La ventana que toca ahora (la misma si sigue abierta; otra, desde el total de ahora, si se paso) y si se ha pasado del tope. */
export function watchRejections(
  window: RejectionWindow | undefined,
  total: number,
  now: number,
): { window: RejectionWindow; exceeded: boolean } {
  const isOpen = window !== undefined && now - window.since < REJECTION_WINDOW_MS;
  if (!isOpen) return { window: { since: now, countAtStart: total }, exceeded: false };
  return { window, exceeded: total - window.countAtStart > MAX_REJECTIONS_PER_WINDOW };
}
