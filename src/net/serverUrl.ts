/**
 * Donde esta el servidor de partidas por la red: la URL que puso Vite al compilar (`VITE_SERVER_URL`,
 * ver .env.example y server/README.md) o la que el jugador (o un test) deja en localStorage para
 * hablar con otro servidor (`ilogic.server`: la suya propia, o uno en local). Puede ser relativa:
 * "/" es el mismo sitio que sirve el juego (el servidor de Node sirve el juego y las salas juntos,
 * `npm run build:selfhost`). Sin ninguna, el juego no ofrece partidas por la red. Lo preguntan el
 * menu (si ofrece «Jugar en línea» y donde pedir la sala) y `OnlineMatch` (la URL del WebSocket,
 * `roomSocketUrl`).
 */

const OVERRIDE_KEY = 'ilogic.server';

/** Sin la barra del final (las rutas se añaden con su propia barra). */
const trimmed = (url: string): string => url.trim().replace(/\/+$/, '');

/** La URL configurada, entera (una relativa, desde la direccion de la pagina `page`), o null si no hay. */
export function absoluteServerUrl(configured: string, page: string): string | null {
  const url = configured.trim();
  if (url.length === 0) return null;
  return trimmed(url.startsWith('/') ? new URL(url, page).href : url);
}

/** La URL del servidor, o null si no hay ninguna configurada. */
export function serverUrl(): string | null {
  const configured = readOverride() ?? (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  return absoluteServerUrl(configured, location.href);
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
