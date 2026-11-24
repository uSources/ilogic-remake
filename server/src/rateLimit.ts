/**
 * Frenar a quien insiste. En una sala: la sala cuenta cuantos mensajes le ha rechazado a cada
 * asiento (`rejectionsOf`), y aqui se mira cuantos han sido en la ultima ventana de tiempo. Pasado
 * el tope, el servidor le corta la conexion (puede volver a entrar con su ficha: no es un castigo,
 * es que un cliente roto o alguien probando no tenga al servidor contestando errores sin parar). Y
 * en lo que no es de una sala (buscar rival), cuantas peticiones de cada direccion (`RequestLimit`).
 */
import { MAX_REJECTIONS_PER_WINDOW, MAX_WATCHED_CLIENTS, REJECTION_WINDOW_MS } from './limits';

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

/** Cuantas peticiones se atienden de cada cliente (su direccion) en una ventana de tiempo que se va moviendo. */
export class RequestLimit {
  /** Cuando llegaron las peticiones de cada cliente que aun cuentan. */
  private readonly times = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /** Si se atiende una peticion mas de ese cliente ahora (si es que si, cuenta). */
  allows(client: string, now: number): boolean {
    if (this.times.size >= MAX_WATCHED_CLIENTS) this.forgetStale(now);
    const recent = (this.times.get(client) ?? []).filter((time) => now - time < this.windowMs);
    const allowed = recent.length < this.maxPerWindow;
    if (allowed) recent.push(now);
    this.times.set(client, recent);
    return allowed;
  }

  /** Olvida a quien ya no tiene peticiones en la ventana (y, si aun son demasiados, a todos). */
  private forgetStale(now: number): void {
    for (const [client, times] of this.times) if (times.every((time) => now - time >= this.windowMs)) this.times.delete(client);
    if (this.times.size >= MAX_WATCHED_CLIENTS) this.times.clear();
  }
}
