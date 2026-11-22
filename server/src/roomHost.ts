/**
 * Lo que una sala del servidor (`HostedRoom`, hostedRoom.ts) pide a quien la aloja: donde se guarda
 * (con la hora a la que hay que despertarla), sus conexiones y la hora. Cloudflare (un Durable
 * Object por sala, src/cloudflare/) y Node (un proceso con todas las salas, node/) lo dan cada uno
 * con sus piezas; la sala no sabe en cual esta.
 */
import type { SeatId } from '@core/net';
import type { TimerSettings, Timers } from './timers';

/** Lo que se sabe de una conexion que ya saludo (en Cloudflare va pegado al socket y sobrevive a la hibernacion). */
export interface Attachment {
  seat: SeatId;
  connection: number;
  /** Su ficha, para volver a meterla en la sala al recuperarla (la sala recuperada no sabe de nadie). */
  token: string;
}

/** Lo que se guarda ademas de la sala: lo que pidio el creador de los relojes, y los relojes. */
export interface RoomMeta {
  settings: TimerSettings;
  timers: Timers;
}

/** Una sala guardada: la del nucleo (sin comprobar: lo hace `Room.restore`) y sus relojes. */
export interface StoredRoom {
  snapshot: unknown;
  meta: RoomMeta;
}

/** Una conexion con la sala, sea de donde sea. */
export interface RoomSocket {
  readonly isOpen: boolean;
  send(text: string): void;
  close(code: number, reason: string): void;
  /** Lo que se sabe de ella desde que saludo (null si aun no). */
  attachment(): Attachment | null;
  attach(attachment: Attachment): void;
}

/** Lo que da a una sala quien la aloja. */
export interface RoomHost {
  /** La sala guardada, o null si no hay. */
  load(): Promise<StoredRoom | null>;
  /** Guarda la sala entera y pone su alarma (una sola: cuando vence el primer reloj, `HostedRoom.ring`). */
  save(room: StoredRoom, wakeAt: number): Promise<void>;
  /** Borra la sala y su alarma. */
  erase(): Promise<void>;
  /** Sus conexiones (las que se estan cerrando pueden seguir en la lista: `isOpen` lo dice). */
  sockets(): readonly RoomSocket[];
  now(): number;
}
