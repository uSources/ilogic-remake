/**
 * Una sala en Cloudflare: un Durable Object por codigo de sala (`idFromName`), que tiene la sala del
 * nucleo en memoria (por `RoomAdapter`, el unico que la toca), la guarda entera en su almacen tras
 * cada mensaje (`snapshot`) y la recupera al despertar (`restore`), lleva las conexiones por el
 * WebSocket Hibernation API (el objeto puede dormirse con las conexiones abiertas: lo que hay que
 * saber de cada una va pegado a ella, `Attachment`) y pone una sola alarma para sus relojes
 * (timers.ts: caducar, el reloj del turno, dar a la IA los asientos que no llegan, seguir una
 * partida que la IA dejo a medias por el presupuesto de pasos: `pending`, `continueMatch`).
 *
 * Por los sockets solo pasa lo que la sala devuelve para cada asiento (`Outgoing`): el servidor no
 * mira la partida ni la manda nunca.
 */
import { DurableObject } from 'cloudflare:workers';
import type { JoinResult, NetError, Outgoing, SeatId } from '@core/net';
import { isObject } from '@core/util/validation';
import { MAX_MESSAGE_BYTES } from './limits';
import { watchRejections, type RejectionWindow } from './rateLimit';
import { RoomAdapter, type HandToAiError, type Invitation, type LobbyInfo } from './roomAdapter';
import type { RoomRequest } from './roomRequest';
import {
  doneWaiting,
  dueTimers,
  initialTimers,
  nextAlarm,
  timedOutSeat,
  touched,
  withContinuation,
  withTurnOf,
  type TimerSettings,
  type Timers,
} from './timers';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ALLOWED_ORIGINS: string;
}

/** Lo que se sabe de una conexion que ya saludo (va con el socket: sobrevive a la hibernacion). */
interface Attachment {
  seat: SeatId;
  connection: number;
  /** Su ficha, para volver a meterla en la sala al despertar (la sala recuperada no sabe de nadie). */
  token: string;
}

/** Lo que se guarda ademas de la sala. */
interface RoomMeta {
  settings: TimerSettings;
  timers: Timers;
}

const KEYS = { room: 'room', meta: 'meta' } as const;

/** Por que el servidor cierra una conexion (codigos de aplicacion del WebSocket: 4000-4999). */
export const CLOSE_CODES = {
  /** Lo primero no fue un saludo, o no era un mensaje. */
  badMessage: 4400,
  badToken: 4401,
  /** Otra pestaña entro con la misma ficha. */
  replaced: 4409,
  /** La sala ya no existe (caduco). */
  gone: 4410,
  /** Mas bytes de los que admite un mensaje. */
  tooBig: 4413,
  badVersion: 4426,
  /** Demasiados mensajes rechazados seguidos. */
  tooManyRejections: 4429,
} as const;

/** El codigo con el que se cierra una conexion a la que la sala no deja entrar. */
const CLOSE_CODE_OF_ERROR: Partial<Record<NetError, number>> = {
  badMessage: CLOSE_CODES.badMessage,
  badToken: CLOSE_CODES.badToken,
  badVersion: CLOSE_CODES.badVersion,
};

export type CreateResult = { ok: true; seats: Invitation[] } | { ok: false; error: 'exists' };

/** El JSON de un texto, o undefined si no lo es (undefined no es un mensaje: la sala lo rechaza como 'badMessage'). */
function parsed(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Un saludo (su forma entera la comprueba la sala): se atiende como entrar, tambien desde una conexion que ya esta. */
const isHello = (message: unknown): message is { kind: 'hello'; token: string } =>
  isObject(message) && message.kind === 'hello' && typeof message.token === 'string';

const attachmentOf = (socket: WebSocket): Attachment | null => (socket.deserializeAttachment() as Attachment | null) ?? null;

export class RoomObject extends DurableObject<Env> {
  /** La sala en memoria (null hasta que se carga del almacen, o si no hay sala). */
  private adapter: RoomAdapter | null = null;
  private meta: RoomMeta | null = null;
  private readonly rejections = new Map<SeatId, RejectionWindow>();

  /** Crea la sala con esa partida. Si ya hay una con este codigo, no la pisa. */
  async create(request: RoomRequest): Promise<CreateResult> {
    if (await this.ctx.storage.get(KEYS.room)) return { ok: false, error: 'exists' };
    const settings: TimerSettings = { turnSeconds: request.turnSeconds, waitingSeconds: request.waitingSeconds };
    this.adapter = RoomAdapter.create(request);
    this.meta = { settings, timers: initialTimers(settings, Date.now()) };
    await this.save(this.adapter, this.meta);
    return { ok: true, seats: this.adapter.invitations() };
  }

  /** Lo que puede saber cualquiera de la sala, o null si no hay sala. */
  async info(): Promise<LobbyInfo | null> {
    const adapter = await this.load();
    return adapter?.lobby() ?? null;
  }

  /** Quien creo la sala da un asiento vacio a la IA (si con el ya estan todos, la partida empieza). */
  async handToAi(token: string, seat: SeatId): Promise<{ ok: true } | { ok: false; error: HandToAiError | 'noSuchRoom' }> {
    const adapter = await this.load();
    if (!adapter) return { ok: false, error: 'noSuchRoom' };
    const handed = adapter.handToAi(token, seat);
    if (!handed.ok) return handed;
    await this.afterActivity(adapter, handed.outgoing);
    return { ok: true };
  }

  /** La subida a WebSocket (lo unico que llega por fetch: lo demas va por RPC). El saludo viene despues, como primer mensaje. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba una subida a WebSocket', { status: 426 });
    if (!(await this.load())) return new Response('No hay tal sala', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return socket.close(CLOSE_CODES.badMessage, 'Solo mensajes de texto (JSON)');
    if (raw.length > MAX_MESSAGE_BYTES) return socket.close(CLOSE_CODES.tooBig, 'Mensaje demasiado grande');
    const adapter = await this.load();
    if (!adapter) return socket.close(CLOSE_CODES.gone, 'La sala ya no existe');
    const message = parsed(raw);
    const attachment = attachmentOf(socket);
    if (!attachment || isHello(message)) return this.greet(socket, adapter, message);
    const outgoing = adapter.handle(attachment.seat, message);
    await this.afterActivity(adapter, outgoing);
    this.restrain(socket, adapter, attachment.seat);
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    await this.forget(socket);
    try {
      socket.close(code, reason);
    } catch {
      // Ya estaba cerrado del todo.
    }
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.forget(socket);
  }

  /** Ha vencido el primer reloj: se atiende lo que haya vencido y se vuelve a poner la alarma. */
  override async alarm(): Promise<void> {
    const adapter = await this.load();
    if (!adapter || !this.meta) return;
    const now = Date.now();
    const due = dueTimers(this.meta.timers, now);
    if (due.includes('expiry')) return this.expire();
    const outgoing: Outgoing[] = [];
    if (due.includes('waiting')) {
      for (const seat of adapter.absentSeats()) outgoing.push(...adapter.replaceWithAi(seat));
      this.meta.timers = doneWaiting(this.meta.timers);
    }
    if (due.includes('turn')) {
      const seat = timedOutSeat(this.meta.timers);
      if (seat !== null) outgoing.push(...adapter.timeOut(seat));
      this.meta.timers = { ...this.meta.timers, turn: null };
    }
    if (due.includes('continue')) outgoing.push(...adapter.continueMatch());
    await this.sync(adapter, outgoing, now);
  }

  /** El primer mensaje de una conexion (o un saludo nuevo): si la sala la deja entrar, queda apuntada en el socket. */
  private async greet(socket: WebSocket, adapter: RoomAdapter, message: unknown): Promise<void> {
    const result = adapter.join(message);
    if (!result.ok) return this.turnAway(socket, result.error);
    // Si la sala lo ha dejado entrar, el mensaje era un saludo con su ficha.
    const token = isHello(message) ? message.token : '';
    this.replaceSockets(result.seat, socket);
    socket.serializeAttachment({ seat: result.seat, connection: result.connection, token } satisfies Attachment);
    await this.afterActivity(adapter, result.messages);
  }

  /** Se le dice por que y se le cierra. */
  private turnAway(socket: WebSocket, error: NetError): void {
    socket.send(JSON.stringify({ kind: 'error', error }));
    socket.close(CLOSE_CODE_OF_ERROR[error] ?? CLOSE_CODES.badMessage, error);
  }

  /** Otra conexion ha entrado en este asiento: las de antes, fuera (la sala ya no las conoce). */
  private replaceSockets(seat: SeatId, current: WebSocket): void {
    for (const socket of this.socketsOf(seat))
      if (socket !== current) socket.close(CLOSE_CODES.replaced, 'Otra conexion ha entrado con esta ficha');
  }

  /** La conexion se ha ido: la sala deja de llevarle nada (si entro por otra despues, no pasa nada). */
  private async forget(socket: WebSocket): Promise<void> {
    const attachment = attachmentOf(socket);
    const adapter = await this.load();
    if (!attachment || !adapter) return;
    adapter.leave(attachment.seat, attachment.connection);
    await this.afterActivity(adapter, []);
  }

  /** Si al asiento se le rechazan demasiados mensajes en poco tiempo, se le corta. */
  private restrain(socket: WebSocket, adapter: RoomAdapter, seat: SeatId): void {
    const watched = watchRejections(this.rejections.get(seat), adapter.rejectionsOf(seat), Date.now());
    this.rejections.set(seat, watched.window);
    if (watched.exceeded) socket.close(CLOSE_CODES.tooManyRejections, 'Demasiados mensajes rechazados');
  }

  /** Alguien ha tocado la sala: caduca mas tarde, y lo demas como tras cualquier paso. */
  private afterActivity(adapter: RoomAdapter, outgoing: Outgoing[]): Promise<void> {
    const now = Date.now();
    if (this.meta) this.meta.timers = touched(this.meta.timers, now);
    return this.sync(adapter, outgoing, now);
  }

  /** Tras un paso: los relojes segun como queda la sala, todo guardado, y los mensajes a sus sockets. */
  private async sync(adapter: RoomAdapter, outgoing: Outgoing[], now: number): Promise<void> {
    if (!this.meta) return;
    let timers = withTurnOf(this.meta.timers, adapter.awaiting(), this.meta.settings, now);
    if (adapter.status !== 'waiting') timers = doneWaiting(timers);
    this.meta.timers = withContinuation(timers, adapter.pending(), now);
    await this.save(adapter, this.meta);
    this.deliver(outgoing);
  }

  private async save(adapter: RoomAdapter, meta: RoomMeta): Promise<void> {
    await this.ctx.storage.put({ [KEYS.room]: adapter.snapshot(), [KEYS.meta]: meta });
    await this.ctx.storage.setAlarm(nextAlarm(meta.timers));
  }

  /** Cada mensaje, a los sockets de su asiento, en orden. */
  private deliver(outgoing: readonly Outgoing[]): void {
    for (const { seat, message } of outgoing) {
      const json = JSON.stringify(message);
      for (const socket of this.socketsOf(seat)) socket.send(json);
    }
  }

  /** Los sockets abiertos de un asiento (uno que se acaba de cerrar sigue en la lista hasta que acaba de cerrarse: no se le manda). */
  private socketsOf(seat: SeatId): WebSocket[] {
    const isOpen = (socket: WebSocket) => socket.readyState === WebSocket.READY_STATE_OPEN;
    return this.ctx.getWebSockets().filter((socket) => isOpen(socket) && attachmentOf(socket)?.seat === seat);
  }

  /**
   * La sala, del almacen si no esta en memoria (al despertar). Las conexiones que siguen abiertas
   * vuelven a entrar con su ficha (reciben su vista entera otra vez: su punto de partida nuevo).
   */
  private async load(): Promise<RoomAdapter | null> {
    if (this.adapter) return this.adapter;
    const stored = await this.ctx.storage.get<unknown>([KEYS.room, KEYS.meta]);
    const snapshot = stored.get(KEYS.room);
    const meta = stored.get(KEYS.meta) as RoomMeta | undefined;
    if (snapshot === undefined || !meta) return null;
    const adapter = RoomAdapter.restore(snapshot);
    if (!adapter) {
      console.error('La sala guardada no se puede recuperar: se borra');
      await this.expire();
      return null;
    }
    this.adapter = adapter;
    this.meta = meta;
    await this.readmitAll(adapter);
    return adapter;
  }

  private async readmitAll(adapter: RoomAdapter): Promise<void> {
    const outgoing: Outgoing[] = [];
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = attachmentOf(socket);
      if (attachment) outgoing.push(...this.readmit(socket, attachment, adapter.rejoin(attachment.token)));
    }
    await this.sync(adapter, outgoing, Date.now());
  }

  /** Una conexion que ya habia saludado, de vuelta en la sala recuperada (si su ficha ya no vale, fuera). */
  private readmit(socket: WebSocket, attachment: Attachment, result: JoinResult): Outgoing[] {
    if (!result.ok) {
      this.turnAway(socket, result.error);
      return [];
    }
    socket.serializeAttachment({ ...attachment, connection: result.connection } satisfies Attachment);
    return result.messages;
  }

  /** La sala se borra entera; quien este dentro se entera por el cierre. */
  private async expire(): Promise<void> {
    for (const socket of this.ctx.getWebSockets()) socket.close(CLOSE_CODES.gone, 'La sala ha caducado');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.adapter = null;
    this.meta = null;
  }
}
