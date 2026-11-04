/**
 * El contenido con el que juega este proceso: el de los ficheros JSON, validado y convertido en
 * tablas. data.ts lo congela y lo reparte; nadie lo cambia.
 *
 * Es el unico punto por el que entra el contenido. Para jugar con otro (una variante de
 * `npm run balance`), la herramienta construye ese contenido nuevo y lo juega en su propio hilo, donde
 * este modulo se sustituye al cargarlo (tools/balance/contentHook.mjs). Este fichero solo exporta
 * ACTIVE_CONTENT: la sustitucion depende de ello.
 */
import { loadContent, type GameContent } from './index';

export const ACTIVE_CONTENT: GameContent = loadContent();
