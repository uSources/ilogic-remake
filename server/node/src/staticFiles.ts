/**
 * El juego, servido por el mismo servidor (la carpeta que deja `vite build`): asi el juego y sus
 * salas estan en la misma direccion, sin CORS ni certificados en una red de casa. Hace falta porque
 * un navegador no deja que una pagina https (la web publica) hable con un servidor sin cifrar, y el
 * de casa de alguien no suele estarlo. Solo se sirve lo que esta dentro de la carpeta; `/` es
 * `index.html`.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

/** Los tipos de lo que hay en el juego compilado (el resto, como bytes sin mas). */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
};
const BYTES = 'application/octet-stream';

const INDEX = 'index.html';

function decoded(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/** El fichero de la carpeta que corresponde a esa ruta, o null si la ruta se sale de ella (`/../`). */
export function fileFor(webDir: string, path: string): string | null {
  const relative = decoded(path);
  if (relative === null) return null;
  const root = resolve(webDir);
  const file = resolve(root, `.${relative.endsWith('/') ? `${relative}${INDEX}` : relative}`);
  return file.startsWith(`${root}${sep}`) ? file : null;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Manda el fichero de esa ruta si lo hay (true); si no, no hace nada (false: lo atienden las rutas de las salas). */
export async function serveFile(webDir: string, path: string, outgoing: ServerResponse): Promise<boolean> {
  const file = fileFor(webDir, path);
  if (!file || !(await isFile(file))) return false;
  outgoing.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(file)] ?? BYTES });
  await pipeline(createReadStream(file), outgoing);
  return true;
}
