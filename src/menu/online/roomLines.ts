/**
 * Como se enseña cada sala de «Mis partidas en línea»: lo que se sabe de ella (lo apuntado en este
 * navegador y lo que dice el servidor, `LobbyInfo`) en una linea con su estado (te toca, le toca a
 * otro, esperando a que entren o buscando rival, acabada, ya no existe), y en que orden van (lo que
 * pide hacer algo, arriba); y lo que dice de todas la tarjeta «En línea» de Inicio. Funciones puras:
 * las usan menuScreen.ts y homeScreen.ts, y las prueba tests/onlineMenu.test.ts.
 */
import { shownTeamNumber } from '../../core/teams';
import type { OnlineCardVM, OnlineRoomState, OnlineRoomVM } from '../../hud/store';
import type { OnlineRoomEntry } from '../../net/onlineRooms';
import type { LobbyInfo } from '../../net/roomApi';
import { t, type TextKey } from '../../settings';
import { paceLabel, paceTurnText, statusText } from './shared';

/** Lo que el servidor dijo de una sala: como esta, que ya no existe, o nada (aun no ha contestado, o no se le alcanza). */
export type RoomLook = { kind: 'info'; info: LobbyInfo } | { kind: 'gone' } | { kind: 'unknown' };

/**
 * La sala ya no va a cambiar (acabo, o ya no existe): no hace falta volver a preguntar por ella. Asi
 * cada vuelta de «Mis partidas» pregunta solo por las que siguen en marcha (y nunca mas de las que
 * se apuntan, `MAX_ENTRIES` en net/onlineRooms.ts).
 */
export const isSettled = (look: RoomLook): boolean => look.kind === 'gone' || (look.kind === 'info' && look.info.status === 'ended');

/**
 * La sala es la de la propia busqueda de rival y aun espera: quitarla es cancelar la busqueda (se
 * cierra en el servidor; si no, seguiria en la cola y le tocaria a alguien).
 */
export function isSearching(entry: OnlineRoomEntry, look: RoomLook): boolean {
  if (entry.search === undefined) return false;
  if (look.kind === 'info') return look.info.status === 'waiting';
  return look.kind === 'unknown' && entry.status === 'waiting';
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Lo que pide hacer algo va arriba: te toca, luego lo que sigue en marcha, y lo acabado y lo que ya no existe, abajo. */
const STATE_ORDER: Record<OnlineRoomState, number> = { yourTurn: 0, waiting: 1, theirTurn: 1, unknown: 2, ended: 3, gone: 4 };

/** "3 h", "12 min", "2 días" o "menos de 1 min": cuanto queda de un turno con reloj. */
export function timeLeftText(ms: number): string {
  if (ms >= DAY_MS) return `${Math.floor(ms / DAY_MS)} ${t('onlineDays')}`;
  if (ms >= HOUR_MS) return `${Math.floor(ms / HOUR_MS)} ${t('onlineHours')}`;
  if (ms >= MINUTE_MS) return `${Math.floor(ms / MINUTE_MS)} ${t('onlineMinutes')}`;
  return t('onlineUnderAMinute');
}

/** En que esta la sala para quien mira desde el asiento `entry.seat`. */
export function roomStateOf(entry: OnlineRoomEntry, look: RoomLook): OnlineRoomState {
  if (look.kind === 'gone') return 'gone';
  if (look.kind === 'unknown') return 'unknown';
  const { status, turn } = look.info;
  if (status !== 'playing') return status;
  return turn?.seat === entry.seat ? 'yourTurn' : 'theirTurn';
}

/** El titulo de la linea: «Te toca», «Turno del equipo 2», «Esperando jugadores»... */
function titleOf(entry: OnlineRoomEntry, look: RoomLook, state: OnlineRoomState): string {
  switch (state) {
    case 'yourTurn':
      return t('onlineYourTurn');
    case 'theirTurn':
      return theirTurnTitle(look);
    case 'waiting':
      return t(entry.search ? 'onlineSearching' : 'onlineWaitingPlayers');
    case 'ended':
      return t('onlineStatusEnded');
    case 'gone':
      return t('onlineGoneShort');
    case 'unknown':
      return statusText(entry.status);
    default:
      return state satisfies never;
  }
}

/** A quien se espera (si es una persona); si no se espera a nadie, la IA esta jugando. */
function theirTurnTitle(look: RoomLook): string {
  if (look.kind !== 'info' || !look.info.turn) return t('onlineAiPlaying');
  const awaited = look.info.turn.seat;
  const team = look.info.seats.find((seat) => seat.seat === awaited)?.team;
  return team === undefined ? t('onlineAiPlaying') : t('onlineTurnOf').replace('{n}', String(shownTeamNumber(team)));
}

/** «3 equipos», si son mas de dos: el duelo es lo normal y no hace falta decirlo. */
const teamsText = (entry: OnlineRoomEntry): string | null => (entry.teams > 2 ? `${entry.teams} ${t('onlineTeams').toLowerCase()}` : null);

const joinParts = (parts: (string | null)[]): string => parts.filter((part): part is string => part !== null).join(' · ');

/** Lo de debajo del titulo: el dia y lo que le queda al turno, cuantos han entrado (o el ritmo que se busca) y, si son mas de dos, cuantos equipos. */
function detailOf(entry: OnlineRoomEntry, look: RoomLook, now: number): string {
  const teams = teamsText(entry);
  if (look.kind !== 'info') return joinParts([teams]);
  const { info } = look;
  if (info.status === 'waiting') return waitingDetail(entry, info, teams);
  const turn = info.turn;
  if (!turn) return joinParts([teams]);
  const day = t('onlineDay').replace('{n}', String(turn.day));
  const left = turn.endsAt === null ? null : `${t('onlineLeft')} ${timeLeftText(Math.max(0, turn.endsAt - now))}`;
  return joinParts([day, left, teams]);
}

/** Mientras espera: el ritmo que se busca («Por turnos · 1 día por turno») o cuantos han entrado («1/2 dentro»). */
function waitingDetail(entry: OnlineRoomEntry, info: LobbyInfo, teams: string | null): string {
  if (entry.search) return `${paceLabel(entry.search)} · ${paceTurnText(entry.search)}`;
  return joinParts([`${joinedCount(info)}/${personCount(info)} ${t('onlineIn')}`, teams]);
}

const personCount = (info: LobbyInfo): number => info.seats.filter((seat) => seat.kind === 'person').length;
const joinedCount = (info: LobbyInfo): number => info.seats.filter((seat) => seat.joined).length;

/** El boton para entrar: «Jugar» si le toca, «Ver» si juega otro o ya acabo, «Entrar» si espera; si la sala ya no existe, ninguno. */
const ENTER_TEXT: Record<OnlineRoomState, TextKey | null> = {
  yourTurn: 'onlinePlay',
  theirTurn: 'onlineWatch',
  ended: 'onlineWatch',
  waiting: 'onlineRejoin',
  unknown: 'onlineRejoin',
  gone: null,
};

function enterLabel(state: OnlineRoomState): string | null {
  const key = ENTER_TEXT[state];
  return key === null ? null : t(key);
}

/** Una partida en juego no se quita de la lista (se dejaria de saber de ella a medias): solo lo que espera, acabo o ya no existe. */
const isForgettable = (state: OnlineRoomState): boolean => state !== 'yourTurn' && state !== 'theirTurn';

/** La linea de una sala en la lista. */
export function roomLineOf(entry: OnlineRoomEntry, look: RoomLook, now: number): OnlineRoomVM {
  const state = roomStateOf(entry, look);
  const forget = isForgettable(state) ? t(isSearching(entry, look) ? 'onlineCancel' : 'onlineForget') : null;
  return {
    code: entry.code,
    state,
    title: titleOf(entry, look, state),
    detail: detailOf(entry, look, now),
    enter: enterLabel(state),
    forget,
  };
}

/** Las lineas de todas las salas, con lo que pide hacer algo arriba (en cada grupo, la mas reciente primero, como estan apuntadas). */
export function roomLines(entries: readonly OnlineRoomEntry[], lookOf: (code: string) => RoomLook, now: number): OnlineRoomVM[] {
  const lines = entries.map((entry) => roomLineOf(entry, lookOf(entry.code), now));
  return lines.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

/** La sala sigue en marcha: se juega o se espera a alguien (sin respuesta del servidor, lo ultimo que se supo). */
function isLive(entry: OnlineRoomEntry, state: OnlineRoomState): boolean {
  if (state === 'unknown') return entry.status !== 'ended';
  return state === 'yourTurn' || state === 'theirTurn' || state === 'waiting';
}

/** La tarjeta «En línea» de Inicio: en cuantas partidas te toca y cuantas siguen en marcha (si ninguna, de que va). */
export function onlineCardOf(entries: readonly OnlineRoomEntry[], lookOf: (code: string) => RoomLook): OnlineCardVM {
  const states = entries.map((entry) => ({ entry, state: roomStateOf(entry, lookOf(entry.code)) }));
  const yourTurn = states.filter(({ state }) => state === 'yourTurn').length;
  const live = states.filter(({ entry, state }) => isLive(entry, state)).length;
  return {
    yourTurn: yourTurn > 0 ? t('onlineCardYourTurn').replace('{n}', String(yourTurn)) : null,
    status: live > 0 ? t('onlineCardLive').replace('{n}', String(live)) : t('onlineCardNote'),
  };
}
