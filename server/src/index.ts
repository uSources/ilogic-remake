/**
 * El Worker: las rutas publicas del servidor de partidas. Crear una sala (`POST /rooms`: devuelve su
 * codigo y la ficha de cada asiento de persona, para los enlaces de invitacion), lo que puede saber
 * cualquiera de una sala (`GET /rooms/:code`) y la conexion de una partida (`GET /rooms/:code/ws`,
 * una subida a WebSocket; el saludo con la ficha va como primer mensaje). Cada sala es un Durable
 * Object (`RoomObject`, roomObject.ts), buscado por su codigo. Las rutas son una lista (`ROUTES`);
 * una ruta nueva es una entrada mas.
 */
import { defaultContent } from '@core/content/default';
import { isRoomCode, newRoomCode } from './codes';
import { corsHeaders, isOriginAllowed } from './cors';
import { MAX_CODE_TRIES, MAX_MESSAGE_BYTES } from './limits';
import type { Env, RoomObject } from './roomObject';
import { isRoomRequest } from './roomRequest';

export { RoomObject } from './roomObject';

type Method = 'GET' | 'POST';

interface Route {
  method: Method;
  /** Con la ruta entera; el primer grupo, el codigo de la sala si lo lleva. */
  pattern: RegExp;
  run: (request: Request, env: Env, code: string) => Promise<Response>;
}

/** Por que no se atiende una peticion (el cuerpo de la respuesta: `{ error }`). */
type RequestError = 'badOrigin' | 'badRequest' | 'badCode' | 'noSuchRoom' | 'notFound' | 'tooBig' | 'noFreeCode';

const STATUS_OF_ERROR: Record<RequestError, number> = {
  badOrigin: 403,
  badRequest: 400,
  badCode: 400,
  noSuchRoom: 404,
  notFound: 404,
  tooBig: 413,
  noFreeCode: 503,
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const refuse = (error: RequestError): Response => json({ error }, STATUS_OF_ERROR[error]);

/** El cuerpo de la peticion como JSON si cabe en el tope; si no cabe o no es JSON, por que. */
async function bodyOf(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; error: RequestError }> {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_MESSAGE_BYTES) return { ok: false, error: 'tooBig' };
  const text = await request.text();
  if (text.length > MAX_MESSAGE_BYTES) return { ok: false, error: 'tooBig' };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'badRequest' };
  }
}

const roomOf = (env: Env, code: string): DurableObjectStub<RoomObject> => env.ROOMS.get(env.ROOMS.idFromName(code));

/** El enlace de invitacion de un asiento, tal como lo entiende la pantalla (su parte tras el #). */
const inviteOf = (code: string, token: string): string => `#/sala/${code}/${token}`;

/**
 * Crea una sala con un codigo nuevo. Un codigo ya ocupado (raro: hay casi 900 millones) se cambia por otro; la
 * respuesta lleva el codigo y, por cada asiento de persona, su ficha y su enlace (quien crea se
 * queda con el primero y reparte los demas).
 */
async function createRoom(request: Request, env: Env): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isRoomRequest(read.body, defaultContent())) return refuse('badRequest');
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const code = newRoomCode();
    const created = await roomOf(env, code).create(read.body);
    if (!created.ok) continue;
    const seats = created.seats.map((seat) => ({ ...seat, invite: inviteOf(code, seat.token) }));
    return json({ code, seats }, 201);
  }
  return refuse('noFreeCode');
}

async function lobbyOf(_request: Request, env: Env, code: string): Promise<Response> {
  const info = await roomOf(env, code).info();
  return info ? json(info) : refuse('noSuchRoom');
}

/** La subida a WebSocket la hace el objeto de la sala (es quien tiene las conexiones). */
async function connect(request: Request, env: Env, code: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') return refuse('badRequest');
  return roomOf(env, code).fetch(request);
}

const ROUTES: readonly Route[] = [
  { method: 'POST', pattern: /^\/rooms$/, run: createRoom },
  { method: 'GET', pattern: /^\/rooms\/([^/]+)$/, run: lobbyOf },
  { method: 'GET', pattern: /^\/rooms\/([^/]+)\/ws$/, run: connect },
];

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  for (const candidate of ROUTES) {
    const match = candidate.pattern.exec(path);
    if (!match || candidate.method !== request.method) continue;
    const code = match[1] ?? '';
    if (code && !isRoomCode(code)) return refuse('badCode');
    return candidate.run(request, env, code);
  }
  return refuse('notFound');
}

/** La respuesta con las cabeceras CORS de ese origen (una subida a WebSocket no se toca). */
function withCors(response: Response, origin: string | null): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS)) return refuse('badOrigin');
    if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
    return withCors(await route(request, env), origin);
  },
} satisfies ExportedHandler<Env>;
