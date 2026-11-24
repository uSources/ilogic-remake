/**
 * Las salas por su codigo, las de quien aloja el servidor (`RoomDirectory`: en Cloudflare, un
 * Durable Object por codigo; en Node, las salas del proceso), y crear una con un codigo que no este
 * ocupado. Lo usan las rutas (routes.ts) y el emparejador (matchmaker.ts), que crea las salas de la
 * busqueda de rival igual que quien pulsa «Crear partida».
 */
import type { SeatId } from '@core/net';
import { newRoomCode } from './codes';
import type { ClaimResult, CloseResult, CreateResult, HandToAiResult } from './hostedRoom';
import { MAX_CODE_TRIES } from './limits';
import type { Invitation, LobbyInfo } from './roomAdapter';
import type { RoomRequest } from './roomRequest';

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
  /** El primer asiento libre de la sala, para quien llega con el codigo (o con la busqueda de rival). */
  claimSeat(code: string): Promise<ClaimResult>;
  handToAi(code: string, token: string, seat: SeatId): Promise<HandToAiResult>;
  /** Quien creo la sala la cierra antes de que empiece. */
  close(code: string, token: string): Promise<CloseResult>;
  /** La subida a WebSocket de la conexion de una sala. */
  connect(code: string, request: Request): Promise<Response>;
}

/** Lo que se contesta a quien se queda con un asiento (al crear la sala, con su codigo o buscando rival): la sala, el asiento y su ficha. */
export interface SeatTicket extends Invitation {
  code: string;
}

export const seatTicket = (code: string, seat: Invitation): SeatTicket => ({ code, ...seat });

/** Por que no se ha podido crear una sala: no caben mas, o no se ha encontrado un codigo libre. */
export type NewRoomError = 'serverFull' | 'noFreeCode';

/**
 * Crea una sala con un codigo nuevo y da su primer asiento a quien la pide. Un codigo ya ocupado
 * (raro: hay casi 900 millones) se cambia por otro.
 */
export async function createRoomWithFreeCode(
  rooms: RoomDirectory,
  request: RoomRequest,
): Promise<{ ok: true; ticket: SeatTicket } | { ok: false; error: NewRoomError }> {
  for (let attempt = 0; attempt < MAX_CODE_TRIES; attempt++) {
    const code = newRoomCode();
    const created = await rooms.create(code, request);
    if (created.ok) return { ok: true, ticket: seatTicket(code, created.seat) };
    if (created.error === 'full') return { ok: false, error: 'serverFull' };
  }
  return { ok: false, error: 'noFreeCode' };
}
