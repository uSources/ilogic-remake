/**
 * Donde esta el servidor de partidas por la red: la URL que puso Vite al compilar (`VITE_SERVER_URL`,
 * ver .env.example y server/README.md) o la que el jugador (o un test) deja en localStorage para
 * hablar con otro servidor (`ilogic.server`: la suya propia, o uno en local). Sin ninguna, el juego no
 * ofrece partidas por la red. Lo preguntan el menu (si ofrece «Jugar en línea» y donde pedir la
 * sala) y `OnlineMatch` (la URL del WebSocket, `roomSocketUrl`).
 */

const OVERRIDE_KEY = 'ilogic.server';

/** Sin la barra del final (las rutas se añaden con su propia barra). */
const trimmed = (url: string): string => url.trim().replace(/\/+$/, '');

/** La URL del servidor, o null si no hay ninguna configurada. */
export function serverUrl(): string | null {
  const override = readOverride();
  const configured = override ?? (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  const url = trimmed(configured);
  return url.length > 0 ? url : null;
}

function readOverride(): string | null {
  try {
    return localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

/** La URL del WebSocket de una sala (`GET /rooms/:code/ws`, con http → ws). */
export const roomSocketUrl = (base: string, code: string): string => `${trimmed(base).replace(/^http/, 'ws')}/rooms/${code}/ws`;
