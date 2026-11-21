/**
 * Un servidor minimo para la pagina de candidatos (tools/audio/out/): abierta como fichero (doble clic,
 * o desde la app de Claude) el navegador no carga los audios de al lado y no suena nada. Contesta a los
 * rangos de bytes (`Range`), que Safari pide siempre para un <audio>.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.flac': 'audio/flac',
};

/** La ruta del fichero que se pide, sin salirse de `root` (null si no hay o se sale). */
function fileFor(root: string, url: string): string | null {
  const path = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const file = normalize(join(root, path.endsWith('/') ? `${path}index.html` : path));
  const isInside = file.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
  return isInside && existsSync(file) && statSync(file).isFile() ? file : null;
}

/** El trozo que pide `Range: bytes=a-b` (sin cabecera, el fichero entero). */
function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return null;
  const [, from = '', to = ''] = match;
  if (from === '') return { start: Math.max(0, size - Number(to)), end: size - 1 };
  return { start: Number(from), end: to === '' ? size - 1 : Math.min(size - 1, Number(to)) };
}

function serveFile(request: IncomingMessage, response: ServerResponse, file: string): void {
  const size = statSync(file).size;
  const headers = {
    'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  const range = byteRange(request.headers.range, size);
  if (!range) {
    response.writeHead(200, { ...headers, 'Content-Length': size });
    createReadStream(file).pipe(response);
    return;
  }
  response.writeHead(206, {
    ...headers,
    'Content-Length': range.end - range.start + 1,
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
  });
  createReadStream(file, range).pipe(response);
}

/** Sirve `root` en `port` (solo en este equipo). */
export function serveFolder(root: string, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    const file = fileFor(root, request.url ?? '/');
    if (!file) {
      response.writeHead(404).end('No esta');
      return;
    }
    serveFile(request, response, file);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
