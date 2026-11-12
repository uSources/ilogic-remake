/**
 * Las rutas del servidor que no son la partida (server/README.md, "Rutas"): crear una sala
 * (`POST /rooms`), el vestibulo (`GET /rooms/:code`: quien esta, sin nada de la partida) y dar un
 * asiento vacio a la IA (`POST /rooms/:code/ai`, solo quien creo la sala). Todo JSON; lo que llega se
 * comprueba por encima (que tenga la forma), porque viene de fuera.
 */
import type { SkirmishChoices } from '../core/match';
import type { RoomStatus, SeatId } from '../core/net';
import type { TeamId } from '../core/model';
import { isInt, isObject } from '../core/util/validation';

/** Topes de lo que se lee del servidor (mas asientos o versiones que esto no son de este juego). */
const MAX_SEAT = 16;
const MAX_VERSION = 1_000_000;

/** Lo que se pide al crear una sala (lo mismo que comprueba el servidor, `server/src/roomRequest.ts`). */
export interface RoomRequest {
  match: SkirmishChoices;
  turnSeconds?: number;
  waitingSeconds?: number;
}

/** Un asiento de persona recien creado: su ficha y su enlace de invitacion (`#/sala/CODIGO/FICHA`). */
export interface CreatedSeat {
  seat: SeatId;
  team: TeamId;
  token: string;
  invite: string;
}

export interface CreatedRoom {
  code: string;
  seats: CreatedSeat[];
}

export interface LobbySeat {
  seat: SeatId;
  team: TeamId;
  kind: 'person' | 'ai';
  joined: boolean;
}

/** Lo que puede saber cualquiera de una sala. */
export interface LobbyInfo {
  status: RoomStatus;
  protocol: number;
  save: number;
  seats: LobbySeat[];
}

/** Por que no ha salido una peticion: lo que dijo el servidor (`{ error }`) o que no hubo respuesta. */
export type ApiFailure = { ok: false; error: string };
export type ApiResult<Value> = { ok: true; value: Value } | ApiFailure;

const isCreatedSeat = (value: unknown): value is CreatedSeat =>
  isObject(value) &&
  isInt(value.seat, 0, MAX_SEAT) &&
  isInt(value.team, 0, MAX_SEAT) &&
  typeof value.token === 'string' &&
  typeof value.invite === 'string';

const isCreatedRoom = (value: unknown): value is CreatedRoom =>
  isObject(value) && typeof value.code === 'string' && Array.isArray(value.seats) && value.seats.every(isCreatedSeat);

const isLobbySeat = (value: unknown): value is LobbySeat =>
  isObject(value) &&
  isInt(value.seat, 0, MAX_SEAT) &&
  isInt(value.team, 0, MAX_SEAT) &&
  (value.kind === 'person' || value.kind === 'ai') &&
  typeof value.joined === 'boolean';

const isLobbyInfo = (value: unknown): value is LobbyInfo =>
  isObject(value) &&
  (value.status === 'waiting' || value.status === 'playing' || value.status === 'ended') &&
  isInt(value.protocol, 0, MAX_VERSION) &&
  isInt(value.save, 0, MAX_VERSION) &&
  Array.isArray(value.seats) &&
  value.seats.every(isLobbySeat);

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

export const createRoom = (base: string, room: RoomRequest): Promise<ApiResult<CreatedRoom>> =>
  request(`${base}/rooms`, jsonPost(room), isCreatedRoom);

export const lobbyOf = (base: string, code: string): Promise<ApiResult<LobbyInfo>> =>
  request(`${base}/rooms/${code}`, { method: 'GET' }, isLobbyInfo);

const isOk = (value: unknown): value is { ok: true } => isObject(value) && value.ok === true;

/** Quien creo la sala (su ficha) da un asiento de persona que no ha entrado a la IA. */
export const handToAi = (base: string, code: string, token: string, seat: SeatId): Promise<ApiResult<{ ok: true }>> =>
  request(`${base}/rooms/${code}/ai`, jsonPost({ token, seat }), isOk);
