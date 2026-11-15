/**
 * «Mis partidas en línea»: las salas en las que este navegador tiene asiento, en localStorage, para
 * volver a entrar (la partida vive en el servidor; aqui solo el codigo, la ficha del asiento y lo
 * ultimo que se supo de ella). Funciones puras sobre la lista mas leer y guardar. Lo usan el menu de
 * «Jugar en línea» (src/menu/online/) y MenuScene (un enlace `#/sala/...` al cargar: `parseInvite`).
 */
import type { RoomStatus, SeatId } from '../core/net';
import type { TeamId } from '../core/model';
import { isInt, isObject } from '../core/util/validation';

export interface OnlineRoomEntry {
  code: string;
  token: string;
  seat: SeatId;
  team: TeamId;
  /** Cuantos equipos tiene la partida. */
  teams: number;
  status: RoomStatus;
  /** Cuando se toco por ultima vez (ms desde 1970). */
  at: number;
  /** Los enlaces de los demas asientos (solo quien creo la sala los tiene: para volver a repartirlos). */
  invites?: { seat: SeatId; team: TeamId; token: string; invite: string }[];
}

const STORAGE_KEY = 'ilogic.online.rooms';
/** Las ultimas que caben en la lista. */
const MAX_ENTRIES = 12;
const MAX_SEATS = 16;
const ROOM_STATUSES: readonly RoomStatus[] = ['waiting', 'playing', 'ended'];

const isEntry = (value: unknown): value is OnlineRoomEntry =>
  isObject(value) &&
  typeof value.code === 'string' &&
  typeof value.token === 'string' &&
  isInt(value.seat, 0, MAX_SEATS) &&
  isInt(value.team, 0, MAX_SEATS) &&
  isInt(value.teams, 2, MAX_SEATS) &&
  ROOM_STATUSES.includes(value.status as RoomStatus) &&
  typeof value.at === 'number' &&
  (value.invites === undefined || (Array.isArray(value.invites) && value.invites.every(isInvite)));

const isInvite = (value: unknown): boolean =>
  isObject(value) && isInt(value.seat, 0, MAX_SEATS) && typeof value.token === 'string' && typeof value.invite === 'string';

/** La lista con esta sala puesta al dia (o añadida), la mas reciente primero. */
export function withRoom(list: readonly OnlineRoomEntry[], entry: OnlineRoomEntry): OnlineRoomEntry[] {
  const others = list.filter((candidate) => candidate.code !== entry.code);
  return [entry, ...others].slice(0, MAX_ENTRIES);
}

export const withoutRoom = (list: readonly OnlineRoomEntry[], code: string): OnlineRoomEntry[] =>
  list.filter((candidate) => candidate.code !== code);

export function readOnlineRooms(): OnlineRoomEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function writeOnlineRooms(list: readonly OnlineRoomEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sin almacenamiento: la lista no se recuerda.
  }
}

/** Apunta (o pone al dia) una sala en la lista guardada. */
export const rememberRoom = (entry: OnlineRoomEntry): void => writeOnlineRooms(withRoom(readOnlineRooms(), entry));

export const forgetRoom = (code: string): void => writeOnlineRooms(withoutRoom(readOnlineRooms(), code));

/** El codigo y la ficha de un enlace de invitacion (`#/sala/CODIGO/FICHA`, con o sin la URL delante), o null. */
export function parseInvite(text: string): { code: string; token: string } | null {
  const match = /#\/sala\/([A-Za-z0-9]+)\/([A-Za-z0-9_-]+)/.exec(text.trim());
  if (match) return { code: match[1]!.toUpperCase(), token: match[2]! };
  const bare = /^([A-Za-z0-9]{4,8})[/ ]([A-Za-z0-9_-]{16,})$/.exec(text.trim());
  return bare ? { code: bare[1]!.toUpperCase(), token: bare[2]! } : null;
}

/** El enlace de invitacion completo a partir de su parte tras el # (la URL de esta pagina, sin su hash). */
export const inviteUrl = (invite: string, pageUrl: string): string => `${pageUrl.split('#')[0]}${invite}`;
