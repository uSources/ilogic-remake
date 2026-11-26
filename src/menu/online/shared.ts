/**
 * Lo que comparten las pantallas de «Jugar en línea» (src/menu/online/): lo que piden a la escena
 * del menu (`OnlineHost`), lo que piden al conjunto que las enlaza (`OnlineScreens`: el foco, el
 * aviso, pasar a otra pantalla, entrar en una sala, buscar rival) y los textos que usan varias. Cada
 * pantalla esta en su modulo: menuScreen (buscar rival, crear, entrar con el codigo, mis partidas),
 * createScreen y lobbyScreen; onlineScreen.ts las enlaza.
 */
import type { SoundPort } from '../../audio/sounds';
import { PACE_RULES, type RoomStatus, type SearchPace, type SeatId } from '../../core/net';
import type { OnlineVM } from '../../hud/store';
import type { OnlineMatch } from '../../net/onlineMatch';
import type { OnlineRoomEntry } from '../../net/onlineRooms';
import type { FatalClose } from '../../net/serverLink';
import { t, type TextKey } from '../../settings';
import type { TerrainPalette } from '../../ui/terrainColors';
import type { RoomWatch } from './roomWatch';

export interface OnlineHost {
  readonly palette: TerrainPalette;
  /** Lo que suena en la sala: quien entra y la conexion. */
  readonly sounds: SoundPort;
  toHome(): void;
  /** La sala esta en juego (o acabada): la escena de la partida sigue con esta conexion. */
  startOnline(match: OnlineMatch): void;
}

/** Cual de las pantallas se ve. */
export type Mode = OnlineVM['mode'];

/**
 * El asiento que el servidor acaba de dar (al crear la sala, con su codigo o buscando rival): con el,
 * la sala se apunta en «Mis partidas» ya. `search`, el ritmo si es la sala de la propia busqueda (aun sin rival).
 */
export interface KnownSeat {
  seat: SeatId;
  team: number;
  search?: SearchPace;
  /** El ritmo de la busqueda que ha llevado a esta sala, con rival ya o sin el: al empezar, «¡Rival encontrado!». */
  found?: SearchPace;
}

/** Lo que cada pantalla pide al conjunto (onlineScreen.ts): lo que es de todas y pasar de una a otra. */
export interface OnlineScreens {
  readonly host: OnlineHost;
  /** Lo que dice el servidor de las salas apuntadas («Mis partidas»; la tarjeta de Inicio mira la misma). */
  readonly rooms: RoomWatch;
  /** El id de lo que tiene el foco (los ids son distintos en todas las pantallas). */
  focus: string;
  /** Algo que ha fallado (se enseña arriba, en cualquier pantalla). */
  error: string | null;
  /** Esperando al servidor (crear, dar un asiento a la IA). */
  busy: boolean;
  /** Pasa a esa pantalla con ese foco (sin publicar). */
  show(mode: Mode, focus: string): void;
  /** Entra en una sala con la ficha de su asiento: el vestibulo (y, cuando la sala juega, la escena). */
  joinRoom(code: string, token: string, known?: KnownSeat): void;
  /** Entra en una sala por su codigo: con el asiento que ya se tiene en ella o, si no, pidiendo uno libre. */
  enterRoom(code: string): void;
  /** Busca rival con ese ritmo y entra en la sala que toque (con rival ya, o la propia esperando). */
  searchRival(pace: SearchPace): void;
  /** Cierra la sala de la propia busqueda y la quita de «Mis partidas»: true si ya no existe (si llego un rival, false y se dice). */
  cancelSearch(entry: OnlineRoomEntry): Promise<boolean>;
  /** Vuelve al menu de «Jugar en línea». */
  toMenu(): void;
  publish(): void;
}

/** "3 min", "1 h", "1 día" o sin límite. */
export function timerText(seconds: number | null): string {
  if (seconds === null) return t('onlineNoTimer');
  if (seconds >= 86400) return t('onlineOneDay');
  if (seconds >= 3600) return `${seconds / 3600} ${t('onlineHours')}`;
  return `${seconds / 60} ${t('onlineMinutes')}`;
}

const PACE_LABEL: Record<SearchPace, TextKey> = { daily: 'onlinePaceDaily', live: 'onlinePaceLive' };

/** «Por turnos» o «En vivo». */
export const paceLabel = (pace: SearchPace): string => t(PACE_LABEL[pace]);

/** «1 día por turno». */
export const paceTurnText = (pace: SearchPace): string => t('onlinePerTurn').replace('{time}', timerText(PACE_RULES[pace].turnSeconds));

/** «Esperando a los demás», «En juego» o «Acabada». */
export const statusText = (status: RoomStatus): string =>
  t(status === 'waiting' ? 'onlineStatusWaiting' : status === 'playing' ? 'onlineStatusPlaying' : 'onlineStatusEnded');

const CLOSE_TEXT: Record<FatalClose, TextKey> = {
  badToken: 'onlineBadToken',
  replaced: 'onlineReplaced',
  gone: 'onlineGone',
  badVersion: 'onlineBadVersion',
  other: 'onlineFailed',
};

/** Por que la sala no deja seguir (un cierre sin arreglo), para enseñarlo: en el vestibulo y en la partida. */
export const closeText = (reason: FatalClose): string => t(CLOSE_TEXT[reason]);
