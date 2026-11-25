/**
 * «Mis partidas en línea»: las salas en las que este navegador tiene asiento, en localStorage, para
 * volver a entrar (la partida vive en el servidor; aqui solo el codigo, la ficha del asiento y lo
 * ultimo que se supo de ella; la sala que abrio una busqueda de rival, con su ritmo). Funciones puras
 * sobre la lista mas leer y guardar, y los enlaces de sala (`#/sala/CODIGO`, el que se reparte;
 * `#/sala/CODIGO/FICHA`, el de un asiento: `parseRoomLink`).
 * Lo usan el menu de «Jugar en línea» (src/menu/online/) y el menu de la vista (un enlace al cargar).
 */
import { isRoomCode, isSearchPace, type RoomStatus, type SearchPace, type SeatId } from '../core/net';
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
  /** Si es la sala que abrio una busqueda de rival, su ritmo: mientras espera, se esta buscando rival (se puede cancelar). */
  search?: SearchPace;
  /** Cuando empezo esa busqueda (ms desde 1970): «Buscando rival…» cuenta desde ahi, aunque se salga y se vuelva. */
  searchedAt?: number;
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
  (value.search === undefined || isSearchPace(value.search)) &&
  (value.searchedAt === undefined || typeof value.searchedAt === 'number');

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

/** Una sala por su codigo y, si se sabe, la ficha del asiento con el que se entra (null: hay que pedir uno). */
export interface RoomLink {
  code: string;
  token: string | null;
}

/**
 * Los patrones que se entienden: el enlace de la sala o de un asiento (con o sin la URL delante), y
 * el codigo a mano (con su ficha o sin ella). Si el codigo es de verdad lo dice despues `isRoomCode`.
 */
const ROOM_LINK_PATTERNS: readonly RegExp[] = [
  /#\/sala\/([A-Za-z0-9]+)(?:\/([A-Za-z0-9_-]+))?\/?$/,
  /^([A-Za-z0-9]+)(?:[/ ]([A-Za-z0-9_-]{16,}))?$/,
];

/**
 * La sala de un enlace (`#/sala/CODIGO`, o el de un asiento con `/FICHA`) o de un codigo escrito, o
 * null si no lo es. El codigo se comprueba como en el servidor (en minusculas tambien vale): lo que
 * no puede ser un codigo no llega a preguntarse.
 */
export function parseRoomLink(text: string): RoomLink | null {
  const trimmed = text.trim();
  const match = ROOM_LINK_PATTERNS.map((pattern) => pattern.exec(trimmed)).find((found) => found !== null);
  const code = match?.[1]?.toUpperCase();
  if (!match || !isRoomCode(code)) return null;
  return { code, token: match[2] ?? null };
}

/** El enlace de la sala para repartir (la URL de esta pagina, sin su hash): quien lo abre pide un asiento libre. */
export const roomLinkUrl = (code: string, pageUrl: string): string => `${pageUrl.split('#')[0]}#/sala/${code}`;
