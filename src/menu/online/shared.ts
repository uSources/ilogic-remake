/**
 * Lo que comparten las pantallas de «Jugar en línea» (src/menu/online/): lo que piden a la escena
 * del menu (`OnlineHost`), lo que piden al conjunto que las enlaza (`OnlineScreens`: el foco, el
 * aviso, pasar a otra pantalla, entrar en una sala) y los textos que usan varias. Cada pantalla esta
 * en su modulo: menuScreen (crear, entrar con el codigo, mis partidas), createScreen y lobbyScreen;
 * onlineScreen.ts las enlaza.
 */
import type { RoomStatus, SeatId } from '../../core/net';
import type { OnlineVM } from '../../hud/store';
import type { OnlineMatch } from '../../net/onlineMatch';
import type { FatalClose } from '../../net/serverLink';
import { t, type TextKey } from '../../settings';
import type { TerrainPalette } from '../../ui/terrainColors';

export interface OnlineHost {
  readonly palette: TerrainPalette;
  toHome(): void;
  /** La sala esta en juego (o acabada): la escena de la partida sigue con esta conexion. */
  startOnline(match: OnlineMatch): void;
}

/** Cual de las pantallas se ve. */
export type Mode = OnlineVM['mode'];

/** El asiento que el servidor acaba de dar (al crear la sala, o con su codigo): con el, la sala se apunta en «Mis partidas» ya. */
export interface KnownSeat {
  seat: SeatId;
  team: number;
}

/** Lo que cada pantalla pide al conjunto (onlineScreen.ts): lo que es de todas y pasar de una a otra. */
export interface OnlineScreens {
  readonly host: OnlineHost;
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
  publish(): void;
}

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
