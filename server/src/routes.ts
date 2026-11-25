/**
 * Las rutas publicas del servidor de partidas, las mismas en Cloudflare y en Node: crear una sala
 * (`POST /rooms`: devuelve su codigo y el asiento de quien la crea, con su ficha), lo que puede saber
 * cualquiera de una sala (`GET /rooms/:code`), si el servidor contesta y que version habla
 * (`GET /health`), pedir un asiento con el codigo (`POST /rooms/:code/seat`: lo que hace quien
 * recibe el enlace de la sala o escribe su codigo), dar a la IA un asiento vacio (`POST /rooms/:code/ai`), cerrar una sala que aun no ha empezado (`POST
 * /rooms/:code/close`), buscar rival (`POST /match`: el emparejador, matchmaker.ts) y la conexion de
 * una partida (`GET /rooms/:code/ws`, una subida a WebSocket; el saludo con la ficha va como primer
 * mensaje). Las salas las busca por su codigo quien aloja el servidor (`RoomDirectory`,
 * roomDirectory.ts). Las rutas son una lista (`ROUTES`); una ruta nueva es una entrada mas.
 */
import { defaultContent } from '@core/content/default';
import { CURRENT_PROTOCOL, isRoomCode, isToken } from '@core/net';
import { isInt, isObject } from '@core/util/validation';
import { corsHeaders, isOriginAllowed } from './cors';
import { MAX_MESSAGE_BYTES, MAX_ROOM_TEAMS } from './limits';
import { searchRequestOf, type RivalSearch } from './matchmaker';
import { createRoomWithFreeCode, seatTicket, type RoomDirectory } from './roomDirectory';
import { isRoomRequest } from './roomRequest';

/** Lo que necesitan las rutas: las salas, el emparejador y desde que otras webs se puede hablar con el servidor (cors.ts). */
export interface ServerSetup {
  rooms: RoomDirectory;
  matchmaker: RivalSearch;
  allowedOrigins: string;
}

/**
 * La cabecera con la direccion de quien pide (para el tope de busquedas de rival). La pone
 * Cloudflare, y el servidor de Node la escribe el mismo con la del socket (httpBridge.ts): la que
 * mande el cliente no cuenta.
 */
export const CLIENT_ADDRESS_HEADER = 'CF-Connecting-IP';

/** Un asiento es como mucho uno por equipo. */
const MAX_SEATS = MAX_ROOM_TEAMS;

type Method = 'GET' | 'POST';

interface Route {
  method: Method;
  /** Con la ruta entera; el primer grupo, el codigo de la sala si lo lleva. */
  pattern: RegExp;
  run: (request: Request, setup: ServerSetup, code: string) => Promise<Response>;
}

/** Por que no se atiende una peticion (el cuerpo de la respuesta: `{ error }`). */
type RequestError =
  | 'badOrigin'
  | 'badRequest'
  | 'badCode'
  | 'noSuchRoom'
  | 'notFound'
  | 'tooBig'
  | 'noFreeCode'
  | 'serverFull'
  | 'badToken'
  | 'notWaiting'
  | 'noFreeSeat'
  | 'noSeat'
  | 'seatTaken'
  | 'tooManySearches';

const STATUS_OF_ERROR: Record<RequestError, number> = {
  badOrigin: 403,
  badRequest: 400,
  badCode: 400,
  noSuchRoom: 404,
  notFound: 404,
  tooBig: 413,
  noFreeCode: 503,
  serverFull: 503,
  badToken: 403,
  notWaiting: 409,
  noFreeSeat: 409,
  noSeat: 404,
  seatTaken: 409,
  tooManySearches: 429,
};

/** Las rutas del servidor de partidas: lo que no es una de estas (en Node) puede ser un fichero del juego. */
export const isApiPath = (path: string): boolean => path === '/match' || path === '/rooms' || path.startsWith('/rooms/');

/** La ruta de la conexion de una sala. */
const SOCKET_PATTERN = /^\/rooms\/([^/]+)\/ws$/;

/** El codigo de la sala si la ruta es la de su conexion y el codigo esta bien escrito; si no, null. */
export function socketRoomCode(path: string): string | null {
  const code = SOCKET_PATTERN.exec(path)?.[1];
  return isRoomCode(code) ? code : null;
}

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

/**
 * Crea una sala con un codigo nuevo; la respuesta lleva el codigo y el asiento de quien la crea (el
 * primero), con su ficha. Los demas piden el suyo con el codigo. Si quien aloja el servidor no admite
 * mas, `serverFull`.
 */
async function createRoom(request: Request, { rooms }: ServerSetup): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isRoomRequest(read.body, defaultContent())) return refuse('badRequest');
  const created = await createRoomWithFreeCode(rooms, read.body);
  return created.ok ? json(created.ticket, 201) : refuse(created.error);
}

/** Que el servidor contesta, con la version del protocolo y de las partidas que habla (sin mirar ninguna sala). */
function health(): Promise<Response> {
  return Promise.resolve(json(CURRENT_PROTOCOL));
}

async function lobbyOf(_request: Request, { rooms }: ServerSetup, code: string): Promise<Response> {
  const info = await rooms.info(code);
  return info ? json(info) : refuse('noSuchRoom');
}

/**
 * Quien llega con el codigo (el enlace de la sala, o escrito a mano) se queda con el primer asiento
 * libre, mientras la sala espera (`POST /rooms/:code/seat`, sin cuerpo). Si ya no espera, `notWaiting`;
 * si todos los asientos son ya de alguien, `noFreeSeat`.
 */
async function claimSeat(_request: Request, { rooms }: ServerSetup, code: string): Promise<Response> {
  const claimed = await rooms.claimSeat(code);
  return claimed.ok ? json(seatTicket(code, claimed.seat)) : refuse(claimed.error);
}

/** Lo que se pide para dar un asiento a la IA: la ficha de quien creo la sala y el asiento. */
const isHandToAiRequest = (value: unknown): value is { token: string; seat: number } =>
  isObject(value) && isToken(value.token) && isInt(value.seat, 0, MAX_SEATS);

/** Quien creo la sala da un asiento vacio a la IA (`POST /rooms/:code/ai`, cuerpo `{ token, seat }`). */
async function handToAi(request: Request, { rooms }: ServerSetup, code: string): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isHandToAiRequest(read.body)) return refuse('badRequest');
  const handed = await rooms.handToAi(code, read.body.token, read.body.seat);
  return handed.ok ? json({ ok: true }) : refuse(handed.error);
}

const isCloseRequest = (value: unknown): value is { token: string } => isObject(value) && isToken(value.token);

/**
 * Quien creo la sala la cierra antes de que empiece (`POST /rooms/:code/close`, cuerpo `{ token }`):
 * cancela su busqueda de rival. Si ya ha empezado, `notWaiting`.
 */
async function closeRoom(request: Request, { rooms }: ServerSetup, code: string): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isCloseRequest(read.body)) return refuse('badRequest');
  const closed = await rooms.close(code, read.body.token);
  return closed.ok ? json({ ok: true }) : refuse(closed.error);
}

/** La direccion de quien pide (sin ella, todos los que no la traen cuentan como uno). */
const clientOf = (request: Request): string => request.headers.get(CLIENT_ADDRESS_HEADER) ?? 'desconocido';

/**
 * Buscar rival (`POST /match`, cuerpo `{ pace, avoid? }`): el asiento de una sala que esperaba a
 * alguien (`matched: true`, la partida ya ha empezado) o el de una sala nueva que espera
 * (`matched: false`). Lo mismo que al crear una sala o pedir asiento, mas `matched`.
 */
async function searchRival(request: Request, { matchmaker }: ServerSetup): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  const search = searchRequestOf(read.body);
  if (!search) return refuse('badRequest');
  const found = await matchmaker.search(clientOf(request), search);
  return found.ok ? json({ ...found.ticket, matched: found.matched }) : refuse(found.error);
}

/** La subida a WebSocket la hace quien tiene las conexiones de la sala. */
async function connect(request: Request, { rooms }: ServerSetup, code: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') return refuse('badRequest');
  return rooms.connect(code, request);
}

const ROUTES: readonly Route[] = [
  { method: 'POST', pattern: /^\/rooms$/, run: createRoom },
  { method: 'GET', pattern: /^\/health$/, run: health },
  { method: 'GET', pattern: /^\/rooms\/([^/]+)$/, run: lobbyOf },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/seat$/, run: claimSeat },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/ai$/, run: handToAi },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/close$/, run: closeRoom },
  { method: 'POST', pattern: /^\/match$/, run: searchRival },
  { method: 'GET', pattern: SOCKET_PATTERN, run: connect },
];

async function route(request: Request, setup: ServerSetup): Promise<Response> {
  const path = new URL(request.url).pathname;
  for (const candidate of ROUTES) {
    const match = candidate.pattern.exec(path);
    if (!match || candidate.method !== request.method) continue;
    const code = match[1] ?? '';
    if (code && !isRoomCode(code)) return refuse('badCode');
    return candidate.run(request, setup, code);
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

/** La respuesta del servidor a una peticion: el origen primero, luego la pregunta previa de CORS y luego su ruta. */
export async function respond(request: Request, setup: ServerSetup): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (!isOriginAllowed(origin, setup.allowedOrigins, new URL(request.url).host)) return refuse('badOrigin');
  if (request.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }), origin);
  return withCors(await route(request, setup), origin);
}
