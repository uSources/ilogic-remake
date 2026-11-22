/**
 * Desde que paginas puede hablar un navegador con el servidor (CORS): la web del juego (GitHub Pages)
 * y las que diga `ALLOWED_ORIGINS` (wrangler.toml, o la variable de entorno en Node), mas localhost y
 * 127.0.0.1 en cualquier puerto (desarrollo) y la propia direccion del servidor si es una IP (el de Node
 * sirve tambien el juego; con un nombre, va en la lista). "null" en la lista deja entrar al juego abierto desde un fichero (file://: es lo
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

/** El `nombre:puerto` de un origen, o null si no es una URL ("null", el de file://). */
function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/** Una IP (v4, o v6 entre corchetes), con su puerto o sin el. */
const IP_HOST = /^(\d{1,3}(\.\d{1,3}){3}|\[[\da-f:.]+\])(:\d+)?$/i;

/**
 * La pagina es del mismo sitio que el servidor (`host`: a quien se ha hecho la peticion) y ese sitio es
 * una IP. Con un nombre no vale: cualquiera puede hacer que su dominio apunte a la IP del servidor (DNS
 * rebinding) y su pagina pareceria del mismo sitio. El nombre propio del servidor va en ALLOWED_ORIGINS.
 */
const isSameIpHost = (origin: string, host: string | undefined): boolean =>
  host !== undefined && IP_HOST.test(host) && hostOf(origin) === host;

/** El origen de la peticion puede hablar con el servidor (sin origen, tambien). */
export function isOriginAllowed(origin: string | null, configured: string, host?: string): boolean {
  if (origin === null) return true;
  return LOCAL_ORIGIN.test(origin) || isSameIpHost(origin, host) || allowedOrigins(configured).includes(origin);
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
