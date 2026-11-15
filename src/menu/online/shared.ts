/**
 * Lo que comparten las pantallas de «Jugar en línea» (src/menu/online/): lo que piden a la escena
 * del menu (`OnlineHost`), lo que piden al conjunto que las enlaza (`OnlineScreens`: el foco, el
 * aviso, pasar a otra pantalla, entrar en una sala) y los textos que usan varias. Cada pantalla esta
 * en su modulo: menuScreen (crear, entrar, mis partidas), createScreen, joinScreen y lobbyScreen;
 * onlineScreen.ts las enlaza. Sin Phaser.
 */
import type { RoomStatus, SeatId } from '../../core/net';
import type { OnlineVM } from '../../hud/store';
import type { OnlineMatch } from '../../net/onlineMatch';
import type { CreatedSeat } from '../../net/roomApi';
import { t } from '../../settings';
import type { TerrainPalette } from '../../ui/terrainColors';

export interface OnlineHost {
  readonly palette: TerrainPalette;
  toHome(): void;
  /** La sala esta en juego (o acabada): la escena de la partida sigue con esta conexion. */
  startOnline(match: OnlineMatch): void;
}

/** Cual de las cuatro pantallas se ve. */
export type Mode = OnlineVM['mode'];

/** Lo que se sabe de un asiento al entrar en una sala recien creada (quien crea lo sabe; quien entra con un enlace, no). */
export interface KnownSeat {
  seat: SeatId;
  team: number;
  invites: CreatedSeat[];
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
  /** Entra en una sala: el vestibulo (y, cuando la sala juega, la escena). */
  joinRoom(code: string, token: string, known?: KnownSeat): void;
  publish(): void;
}

/** «Esperando a los demás», «En juego» o «Acabada». */
export const statusText = (status: RoomStatus): string =>
  t(status === 'waiting' ? 'onlineStatusWaiting' : status === 'playing' ? 'onlineStatusPlaying' : 'onlineStatusEnded');
