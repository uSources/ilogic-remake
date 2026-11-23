/**
 * Las rutas del servidor que no son la partida (server/README.md, "Rutas"): crear una sala
 * (`POST /rooms`), pedir un asiento con el codigo (`POST /rooms/:code/seat`), lo que sabe cualquiera
 * de una sala (`GET /rooms/:code`: quien esta y de quien es el turno, sin nada de la partida) y dar un
 * asiento vacio a la IA (`POST /rooms/:code/ai`, solo quien creo la sala). Todo JSON; lo que llega se
 * comprueba por encima (que tenga la forma), porque viene de fuera. Lo usan las pantallas de
 * «Jugar en línea» (src/menu/online/); la partida va aparte, por el WebSocket (serverLink.ts).
 */
import type { SkirmishChoices } from '../core/match';
import type { RoomStatus, SeatId } from '../core/net';
import type { TeamId } from '../core/model';
import { isInt, isObject } from '../core/util/validation';

/** Topes de lo que se lee del servidor (mas asientos o versiones que esto no son de este juego). */
const MAX_SEAT = 16;
const MAX_VERSION = 1_000_000;
const MAX_DAY = 1_000_000;

/** Lo que se pide al crear una sala (lo mismo que comprueba el servidor, `server/src/roomRequest.ts`). */
export interface RoomRequest {
  match: SkirmishChoices;
  turnSeconds?: number;
  waitingSeconds?: number;
}

/** El asiento de quien crea la sala o llega con su codigo: la sala, el asiento y su ficha (con ella se entra y se vuelve). */
export interface SeatTicket {
  code: string;
  seat: SeatId;
  team: TeamId;
  token: string;
}

export interface LobbySeat {
  seat: SeatId;
  team: TeamId;
  kind: 'person' | 'ai';
  joined: boolean;
}

/** De quien es el turno (una persona), el dia y cuando se le acaba (ms desde 1970; null si no hay reloj). */
export interface LobbyTurn {
  seat: SeatId;
  day: number;
  endsAt: number | null;
}

/** Lo que puede saber cualquiera de una sala. */
export interface LobbyInfo {
  status: RoomStatus;
  protocol: number;
  save: number;
  seats: LobbySeat[];
  /** A quien se espera (null si a nadie: esperan a que entren, juega la IA o se acabo). */
  turn: LobbyTurn | null;
}

/** Por que no ha salido una peticion: lo que dijo el servidor (`{ error }`) o que no hubo respuesta. */
export type ApiFailure = { ok: false; error: string };
export type ApiResult<Value> = { ok: true; value: Value } | ApiFailure;

const isSeatTicket = (value: unknown): value is SeatTicket =>
  isObject(value) &&
  typeof value.code === 'string' &&
  isInt(value.seat, 0, MAX_SEAT) &&
  isInt(value.team, 0, MAX_SEAT) &&
  typeof value.token === 'string';

const isLobbySeat = (value: unknown): value is LobbySeat =>
  isObject(value) &&
  isInt(value.seat, 0, MAX_SEAT) &&
  isInt(value.team, 0, MAX_SEAT) &&
  (value.kind === 'person' || value.kind === 'ai') &&
  typeof value.joined === 'boolean';

const isLobbyTurn = (value: unknown): value is LobbyTurn =>
  isObject(value) &&
  isInt(value.seat, 0, MAX_SEAT) &&
  isInt(value.day, 1, MAX_DAY) &&
  (value.endsAt === null || isInt(value.endsAt, 0, Number.MAX_SAFE_INTEGER));

const isLobbyInfo = (value: unknown): value is LobbyInfo =>
  isObject(value) &&
  (value.status === 'waiting' || value.status === 'playing' || value.status === 'ended') &&
  isInt(value.protocol, 0, MAX_VERSION) &&
  isInt(value.save, 0, MAX_VERSION) &&
  Array.isArray(value.seats) &&
  value.seats.every(isLobbySeat) &&
  (value.turn === null || isLobbyTurn(value.turn));

/** Una peticion al servidor: la respuesta si tiene la forma esperada, o por que no. */
async function request<Value>(url: string, init: RequestInit, hasShape: (value: unknown) => value is Value): Promise<ApiResult<Value>> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, error: 'unreachable' };
  }
  const body = await bodyOf(response);
  if (!response.ok) return { ok: false, error: isObject(body) && typeof body.error === 'string' ? body.error : `http${response.status}` };
  return hasShape(body) ? { ok: true, value: body } : { ok: false, error: 'badResponse' };
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

/** Crea la sala: quien la crea se queda con el primer asiento. */
export const createRoom = (base: string, room: RoomRequest): Promise<ApiResult<SeatTicket>> =>
  request(`${base}/rooms`, jsonPost(room), isSeatTicket);

/** Pide un asiento con el codigo de la sala (el primero libre, mientras la sala espera). */
export const claimSeat = (base: string, code: string): Promise<ApiResult<SeatTicket>> =>
  request(`${base}/rooms/${code}/seat`, { method: 'POST' }, isSeatTicket);

export const lobbyOf = (base: string, code: string): Promise<ApiResult<LobbyInfo>> =>
  request(`${base}/rooms/${code}`, { method: 'GET' }, isLobbyInfo);

const isOk = (value: unknown): value is { ok: true } => isObject(value) && value.ok === true;

/** Quien creo la sala (su ficha) da un asiento de persona que no ha entrado a la IA. */
export const handToAi = (base: string, code: string, token: string, seat: SeatId): Promise<ApiResult<{ ok: true }>> =>
  request(`${base}/rooms/${code}/ai`, jsonPost({ token, seat }), isOk);
