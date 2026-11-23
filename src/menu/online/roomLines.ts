/**
 * Como se enseña cada sala de «Mis partidas en línea»: lo que se sabe de ella (lo apuntado en este
 * navegador y lo que dice el servidor, `LobbyInfo`) en una linea con su estado (te toca, le toca a
 * otro, esperando a que entren, acabada, ya no existe), y en que orden van (lo que pide hacer algo,
 * arriba). Funciones puras: las usa menuScreen.ts y las prueba tests/onlineMenu.test.ts.
 */
import { shownTeamNumber } from '../../core/teams';
import type { OnlineRoomState, OnlineRoomVM } from '../../hud/store';
import type { OnlineRoomEntry } from '../../net/onlineRooms';
import type { LobbyInfo } from '../../net/roomApi';
import { t } from '../../settings';
import { statusText } from './shared';

/** Lo que el servidor dijo de una sala: como esta, que ya no existe, o nada (aun no ha contestado, o no se le alcanza). */
export type RoomLook = { kind: 'info'; info: LobbyInfo } | { kind: 'gone' } | { kind: 'unknown' };

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
      return t('onlineWaitingPlayers');
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

/** Lo de debajo del titulo: el dia y lo que le queda al turno, cuantos han entrado, cuantos equipos. */
function detailOf(entry: OnlineRoomEntry, look: RoomLook, now: number): string {
  const teams = `${entry.teams} ${t('onlineTeams').toLowerCase()}`;
  if (look.kind !== 'info') return teams;
  const { info } = look;
  if (info.status === 'waiting') return `${joinedCount(info)}/${personCount(info)} ${t('onlineIn')} · ${teams}`;
  const turn = info.turn;
  if (!turn) return teams;
  const day = t('onlineDay').replace('{n}', String(turn.day));
  const left = turn.endsAt === null ? null : `${t('onlineLeft')} ${timeLeftText(Math.max(0, turn.endsAt - now))}`;
  return [day, left, teams].filter((part): part is string => part !== null).join(' · ');
}

const personCount = (info: LobbyInfo): number => info.seats.filter((seat) => seat.kind === 'person').length;
const joinedCount = (info: LobbyInfo): number => info.seats.filter((seat) => seat.joined).length;

/** El boton para entrar: «Jugar» si le toca; si la sala ya no existe, ninguno. */
function enterLabel(state: OnlineRoomState): string | null {
  if (state === 'gone') return null;
  return t(state === 'yourTurn' ? 'onlinePlay' : 'onlineRejoin');
}

/** La linea de una sala en la lista. */
export function roomLineOf(entry: OnlineRoomEntry, look: RoomLook, now: number): OnlineRoomVM {
  const state = roomStateOf(entry, look);
  return { code: entry.code, state, title: titleOf(entry, look, state), detail: detailOf(entry, look, now), enter: enterLabel(state) };
}

/** Las lineas de todas las salas, con lo que pide hacer algo arriba (en cada grupo, la mas reciente primero, como estan apuntadas). */
export function roomLines(entries: readonly OnlineRoomEntry[], lookOf: (code: string) => RoomLook, now: number): OnlineRoomVM[] {
  const lines = entries.map((entry) => roomLineOf(entry, lookOf(entry.code), now));
  return lines.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}
