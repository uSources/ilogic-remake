/**
 * Las rutas publicas del servidor de partidas, las mismas en Cloudflare y en Node: crear una sala
 * (`POST /rooms`: devuelve su codigo y el asiento de quien la crea, con su ficha), lo que puede saber
 * cualquiera de una sala (`GET /rooms/:code`), pedir un asiento con el codigo (`POST
 * /rooms/:code/seat`: lo que hace quien recibe el enlace de la sala o escribe su codigo), dar a la IA
 * un asiento vacio (`POST /rooms/:code/ai`) y la conexion de una partida (`GET /rooms/:code/ws`, una
 * subida a WebSocket; el saludo con la ficha va como primer mensaje). Las salas las busca por su codigo quien
 * aloja el servidor (`RoomDirectory`): en Cloudflare, un Durable Object por codigo; en Node, las salas
 * del proceso. Las rutas son una lista (`ROUTES`); una ruta nueva es una entrada mas.
 */
import { defaultContent } from '@core/content/default';
import { isRoomCode, isToken, type SeatId } from '@core/net';
import { isInt, isObject } from '@core/util/validation';
import { newRoomCode } from './codes';
import { corsHeaders, isOriginAllowed } from './cors';
import type { ClaimResult, CreateResult, HandToAiResult } from './hostedRoom';
import { MAX_CODE_TRIES, MAX_MESSAGE_BYTES, MAX_ROOM_TEAMS } from './limits';
import type { Invitation, LobbyInfo } from './roomAdapter';
import { isRoomRequest, type RoomRequest } from './roomRequest';

/** Quien aloja el servidor no admite mas salas (el de Node tiene un tope; Cloudflare, no). */
export interface RoomsFull {
  ok: false;
  error: 'full';
}

/** Las salas, por su codigo, de quien aloja el servidor. */
export interface RoomDirectory {
  /** Crea la sala con ese codigo (si ya hay una, `exists`: se prueba otro; si no caben mas, `full`). */
  create(code: string, request: RoomRequest): Promise<CreateResult | RoomsFull>;
  info(code: string): Promise<LobbyInfo | null>;
  /** El primer asiento libre de la sala, para quien llega con el codigo. */
  claimSeat(code: string): Promise<ClaimResult>;
  handToAi(code: string, token: string, seat: SeatId): Promise<HandToAiResult>;
  /** La subida a WebSocket de la conexion de una sala. */
  connect(code: string, request: Request): Promise<Response>;
}

/** Lo que necesitan las rutas: las salas y desde que otras webs se puede hablar con el servidor (cors.ts). */
export interface ServerSetup {
  rooms: RoomDirectory;
  allowedOrigins: string;
}

/** Un asiento es como mucho uno por equipo. */
const MAX_SEATS = MAX_ROOM_TEAMS;

type Method = 'GET' | 'POST';

interface Route {
  method: Method;
  /** Con la ruta entera; el primer grupo, el codigo de la sala si lo lleva. */
  pattern: RegExp;
  run: (request: Request, rooms: RoomDirectory, code: string) => Promise<Response>;
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
  | 'seatTaken';

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
};

/** Las rutas de las salas: lo que no empieza asi no es del servidor de partidas (en Node puede ser el juego). */
export const isRoomsPath = (path: string): boolean => path === '/rooms' || path.startsWith('/rooms/');

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

/** Lo que se contesta a quien se queda con un asiento (al crear la sala o con su codigo): la sala, el asiento y su ficha. */
const seatTicket = (code: string, seat: Invitation) => ({ code, ...seat });

/**
 * Crea una sala con un codigo nuevo. Un codigo ya ocupado (raro: hay casi 900 millones) se cambia por
 * otro; la respuesta lleva el codigo y el asiento de quien la crea (el primero), con su ficha. Los
 * demas piden el suyo con el codigo. Si quien aloja el servidor no admite mas, `serverFull`.
 */
async function createRoom(request: Request, rooms: RoomDirectory): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isRoomRequest(read.body, defaultContent())) return refuse('badRequest');
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const code = newRoomCode();
    const created = await rooms.create(code, read.body);
    if (created.ok) return json(seatTicket(code, created.seat), 201);
    if (created.error === 'full') return refuse('serverFull');
  }
  return refuse('noFreeCode');
}

async function lobbyOf(_request: Request, rooms: RoomDirectory, code: string): Promise<Response> {
  const info = await rooms.info(code);
  return info ? json(info) : refuse('noSuchRoom');
}

/**
 * Quien llega con el codigo (el enlace de la sala, o escrito a mano) se queda con el primer asiento
 * libre, mientras la sala espera (`POST /rooms/:code/seat`, sin cuerpo). Si ya no espera, `notWaiting`;
 * si todos los asientos son ya de alguien, `noFreeSeat`.
 */
async function claimSeat(_request: Request, rooms: RoomDirectory, code: string): Promise<Response> {
  const claimed = await rooms.claimSeat(code);
  return claimed.ok ? json(seatTicket(code, claimed.seat)) : refuse(claimed.error);
}

/** Lo que se pide para dar un asiento a la IA: la ficha de quien creo la sala y el asiento. */
const isHandToAiRequest = (value: unknown): value is { token: string; seat: number } =>
  isObject(value) && isToken(value.token) && isInt(value.seat, 0, MAX_SEATS);

/** Quien creo la sala da un asiento vacio a la IA (`POST /rooms/:code/ai`, cuerpo `{ token, seat }`). */
async function handToAi(request: Request, rooms: RoomDirectory, code: string): Promise<Response> {
  const read = await bodyOf(request);
  if (!read.ok) return refuse(read.error);
  if (!isHandToAiRequest(read.body)) return refuse('badRequest');
  const handed = await rooms.handToAi(code, read.body.token, read.body.seat);
  return handed.ok ? json({ ok: true }) : refuse(handed.error);
}

/** La subida a WebSocket la hace quien tiene las conexiones de la sala. */
async function connect(request: Request, rooms: RoomDirectory, code: string): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') return refuse('badRequest');
  return rooms.connect(code, request);
}

const ROUTES: readonly Route[] = [
  { method: 'POST', pattern: /^\/rooms$/, run: createRoom },
  { method: 'GET', pattern: /^\/rooms\/([^/]+)$/, run: lobbyOf },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/seat$/, run: claimSeat },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/ai$/, run: handToAi },
  { method: 'GET', pattern: SOCKET_PATTERN, run: connect },
];

async function route(request: Request, rooms: RoomDirectory): Promise<Response> {
  const path = new URL(request.url).pathname;
  for (const candidate of ROUTES) {
    const match = candidate.pattern.exec(path);
    if (!match || candidate.method !== request.method) continue;
    const code = match[1] ?? '';
    if (code && !isRoomCode(code)) return refuse('badCode');
    return candidate.run(request, rooms, code);
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
  return withCors(await route(request, setup.rooms), origin);
}
