/**
 * Como se configura el servidor de Node: con variables de entorno, que es lo que se pone en Docker o
 * en un servicio del sistema. Sin ninguna vale para probar en casa: el puerto de `wrangler dev`
 * (asi el juego en desarrollo habla con cualquiera de los dos sin tocar nada), las salas en
 * `server/data` y el juego de `dist/` si se ha compilado.
 */
import type { NodeServerOptions } from './nodeServer';

/** Las variables que se miran (las demas del entorno dan igual). */
export interface Environment {
  /** El puerto donde escucha. */
  PORT?: string;
  /** Donde escucha (sin decirlo, en todas las direcciones del equipo). */
  HOST?: string;
  /** La carpeta de las salas guardadas. */
  ILOGIC_DATA_DIR?: string;
  /** La carpeta del juego compilado; vacia, no se sirve el juego (solo las salas). */
  ILOGIC_WEB_DIR?: string;
  /** Las otras webs que pueden hablar con el servidor, separadas por comas (como en wrangler.toml). */
  ALLOWED_ORIGINS?: string;
}

/** Lo que vale si no se dice: las carpetas dependen de donde esta el servidor, asi que las pone quien arranca. */
export interface Defaults {
  dataDir: string;
  webDir: string | null;
}

export const DEFAULT_PORT = 8787;
const MAX_PORT = 65535;
/** Las mismas que wrangler.toml: la web del juego (GitHub Pages) y el juego abierto desde un fichero. */
export const DEFAULT_ALLOWED_ORIGINS = 'https://usources.github.io,null';

export type ReadConfig = { ok: true; options: NodeServerOptions } | { ok: false; error: string };

function portOf(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= MAX_PORT ? port : null;
}

/** La carpeta del juego: la que se diga (vacia: ninguna) o la de siempre. */
function webDirOf(value: string | undefined, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  return value.length > 0 ? value : null;
}

/** La configuracion del servidor segun el entorno, o que variable esta mal. */
export function serverConfig(env: Environment, defaults: Defaults): ReadConfig {
  const port = portOf(env.PORT);
  if (port === null) return { ok: false, error: `PORT tiene que ser un numero de puerto (0 a ${MAX_PORT}), no «${env.PORT}»` };
  const options: NodeServerOptions = {
    port,
    hostname: env.HOST || undefined,
    dataDir: env.ILOGIC_DATA_DIR || defaults.dataDir,
    webDir: webDirOf(env.ILOGIC_WEB_DIR, defaults.webDir),
    allowedOrigins: env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS,
  };
  return { ok: true, options };
}
