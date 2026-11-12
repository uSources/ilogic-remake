/**
 * Desde que paginas puede hablar un navegador con el servidor (CORS): la web del juego (GitHub Pages)
 * y las que diga `ALLOWED_ORIGINS` (wrangler.toml), mas localhost y 127.0.0.1 en cualquier puerto
 * (desarrollo). "null" en la lista deja entrar al juego abierto desde un fichero (file://: es lo
 * que manda el navegador como origen). Una peticion sin origen (otro servidor, curl) no es de un
 * navegador: no hace falta CORS y pasa. La subida a WebSocket mira el origen igual.
 */

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Los origenes de la configuracion (separados por comas, sin espacios de mas). */
export const allowedOrigins = (configured: string): string[] =>
  configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

/** El origen de la peticion puede hablar con el servidor (sin origen, tambien). */
export function isOriginAllowed(origin: string | null, configured: string): boolean {
  if (origin === null) return true;
  return LOCAL_ORIGIN.test(origin) || allowedOrigins(configured).includes(origin);
}

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';
/** Cuanto puede guardar el navegador la respuesta a su pregunta previa (OPTIONS). */
const PREFLIGHT_MAX_AGE_SECONDS = 86400;

/** Las cabeceras CORS para una respuesta a ese origen (ninguna si no hay origen: no es un navegador). */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin === null) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': String(PREFLIGHT_MAX_AGE_SECONDS),
    Vary: 'Origin',
  };
}
