/**
 * De `node:http` a las rutas y vuelta: una peticion de Node como `Request`, que es lo que entienden
 * las rutas (routes.ts, las mismas que en Cloudflare), y su `Response` de vuelta. Del cuerpo se
 * guarda como mucho el tope y un byte mas (para que las rutas vean que se pasa): lo grande no se
 * queda en memoria.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const hasBody = (method: string): boolean => method !== 'GET' && method !== 'HEAD';

function headersOf(incoming: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

/** El cuerpo hasta `limit` bytes; lo demas se lee y se tira (si no, el cliente se queda esperando). */
async function readUpTo(incoming: IncomingMessage, limit: number): Promise<Buffer> {
  const kept: Buffer[] = [];
  let size = 0;
  for await (const chunk of incoming as AsyncIterable<Buffer>) {
    const room = limit - size;
    if (room <= 0) continue;
    const piece = chunk.subarray(0, room);
    kept.push(piece);
    size += piece.length;
  }
  return Buffer.concat(kept);
}

/** La peticion como `Request`, con su cuerpo leido hasta `maxBytes` (y uno mas). */
export async function requestOf(incoming: IncomingMessage, maxBytes: number): Promise<Request> {
  const url = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? 'localhost'}`);
  const method = incoming.method ?? 'GET';
  const body = hasBody(method) ? await readUpTo(incoming, maxBytes + 1) : undefined;
  return new Request(url, { method, headers: headersOf(incoming), body });
}

/** La respuesta de las rutas, mandada por Node. */
export async function send(response: Response, outgoing: ServerResponse): Promise<void> {
  const body = Buffer.from(await response.arrayBuffer());
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(body);
}
