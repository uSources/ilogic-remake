/**
 * Una sala del servidor, se aloje donde se aloje: tiene la sala del nucleo en memoria (por
 * `RoomAdapter`, el unico que la toca), la guarda entera tras cada mensaje (`snapshot`) y la recupera
 * cuando no la tiene (`restore`: al despertar en Cloudflare, al arrancar en Node), atiende sus
 * conexiones y lleva sus relojes con una sola alarma (timers.ts: caducar, el reloj del turno, dar a
 * la IA los asientos que no llegan, seguir una partida que la IA dejo a medias por el presupuesto de
 * pasos: `isMidway`, `continueMatch`). Lo de cada sitio (el almacen, los sockets, la alarma) lo pone
 * su `RoomHost` (roomHost.ts).
 *
 * Por los sockets solo pasa lo que la sala devuelve para cada asiento (`Outgoing`): el servidor no
 * mira la partida ni la manda nunca.
 */
import type { JoinResult, NetError, Outgoing, SeatId } from '@core/net';
import { isObject } from '@core/util/validation';
import { MAX_MESSAGE_BYTES } from './limits';
import { watchRejections, type RejectionWindow } from './rateLimit';
import { RoomAdapter, type HandToAiError, type Invitation, type LobbyInfo } from './roomAdapter';
import type { Attachment, RoomHost, RoomMeta, RoomSocket } from './roomHost';
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
} from './timers';

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
export type HandToAiResult = { ok: true } | { ok: false; error: HandToAiError | 'noSuchRoom' };

/** Lo que llega por un socket: texto (los mensajes son JSON) o bytes (que no son un mensaje). */
export type RawMessage = string | ArrayBuffer | Uint8Array;

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

export class HostedRoom {
  /** La sala en memoria (null hasta que se carga, o si no hay sala). */
  private adapter: RoomAdapter | null = null;
  private meta: RoomMeta | null = null;
  /** La carga en curso: dos llamadas seguidas no recuperan la sala dos veces. */
  private loading: Promise<RoomAdapter | null> | null = null;
  private readonly rejections = new Map<SeatId, RejectionWindow>();

  constructor(private readonly host: RoomHost) {}

  /** Crea la sala con esa partida. Si ya hay una, no la pisa. */
  async create(request: RoomRequest): Promise<CreateResult> {
    if (await this.load()) return { ok: false, error: 'exists' };
    const settings: TimerSettings = { turnSeconds: request.turnSeconds, waitingSeconds: request.waitingSeconds };
    this.adapter = RoomAdapter.create(request);
    this.meta = { settings, timers: initialTimers(settings, this.host.now()) };
    await this.save(this.adapter, this.meta);
    return { ok: true, seats: this.adapter.invitations() };
  }

  /** Si la sala existe (si estaba guardada, queda en memoria y con su alarma puesta). */
  async exists(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  /** Lo que puede saber cualquiera de la sala, o null si no hay sala. */
  async info(): Promise<LobbyInfo | null> {
    const adapter = await this.load();
    return adapter?.lobby() ?? null;
  }

  /** Quien creo la sala da un asiento vacio a la IA (si con el ya estan todos, la partida empieza). */
  async handToAi(token: string, seat: SeatId): Promise<HandToAiResult> {
    const adapter = await this.load();
    if (!adapter) return { ok: false, error: 'noSuchRoom' };
    const handed = adapter.handToAi(token, seat);
    if (!handed.ok) return handed;
    await this.afterActivity(adapter, handed.outgoing);
    return { ok: true };
  }

  /** Un mensaje de una conexion: el primero tiene que ser el saludo. */
  async receive(socket: RoomSocket, raw: RawMessage): Promise<void> {
    if (typeof raw !== 'string') return socket.close(CLOSE_CODES.badMessage, 'Solo mensajes de texto (JSON)');
    if (raw.length > MAX_MESSAGE_BYTES) return socket.close(CLOSE_CODES.tooBig, 'Mensaje demasiado grande');
    const adapter = await this.load();
    if (!adapter) return socket.close(CLOSE_CODES.gone, 'La sala ya no existe');
    const message = parsed(raw);
    const attachment = socket.attachment();
    if (!attachment || isHello(message)) return this.greet(socket, adapter, message);
    const outgoing = adapter.handle(attachment.seat, message);
    // Se cuenta ya, en el orden en que llegan: en Node pueden llegar muchos antes de que se guarde el primero.
    const hasInsisted = this.isOverRejectionLimit(adapter, attachment.seat);
    await this.afterActivity(adapter, outgoing);
    if (hasInsisted) socket.close(CLOSE_CODES.tooManyRejections, 'Demasiados mensajes rechazados');
  }

  /** La conexion se ha ido: la sala deja de llevarle nada (si entro por otra despues, no pasa nada). */
  async forget(socket: RoomSocket): Promise<void> {
    const attachment = socket.attachment();
    const adapter = await this.load();
    if (!attachment || !adapter) return;
    adapter.leave(attachment.seat, attachment.connection);
    await this.afterActivity(adapter, []);
  }

  /** Ha sonado la alarma: se atiende lo que haya vencido y se vuelve a poner. */
  async ring(): Promise<void> {
    const adapter = await this.load();
    if (!adapter || !this.meta) return;
    const now = this.host.now();
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
  private async greet(socket: RoomSocket, adapter: RoomAdapter, message: unknown): Promise<void> {
    const result = adapter.join(message);
    if (!result.ok) return this.turnAway(socket, result.error);
    // Si la sala lo ha dejado entrar, el mensaje era un saludo con su ficha.
    const token = isHello(message) ? message.token : '';
    this.replaceSockets(result.seat, socket);
    socket.attach({ seat: result.seat, connection: result.connection, token });
    await this.afterActivity(adapter, result.messages);
  }

  /** Se le dice por que y se le cierra. */
  private turnAway(socket: RoomSocket, error: NetError): void {
    socket.send(JSON.stringify({ kind: 'error', error }));
    socket.close(CLOSE_CODE_OF_ERROR[error] ?? CLOSE_CODES.badMessage, error);
  }

  /** Otra conexion ha entrado en este asiento: las de antes, fuera (la sala ya no las conoce). */
  private replaceSockets(seat: SeatId, current: RoomSocket): void {
    for (const socket of this.socketsOf(seat))
      if (socket !== current) socket.close(CLOSE_CODES.replaced, 'Otra conexion ha entrado con esta ficha');
  }

  /** Apunta los rechazos del asiento en su ventana y dice si se ha pasado del tope (entonces se le corta). */
  private isOverRejectionLimit(adapter: RoomAdapter, seat: SeatId): boolean {
    const watched = watchRejections(this.rejections.get(seat), adapter.rejectionsOf(seat), this.host.now());
    this.rejections.set(seat, watched.window);
    return watched.exceeded;
  }

  /** Alguien ha tocado la sala: caduca mas tarde, y lo demas como tras cualquier paso. */
  private afterActivity(adapter: RoomAdapter, outgoing: Outgoing[]): Promise<void> {
    const now = this.host.now();
    if (this.meta) this.meta.timers = touched(this.meta.timers, now);
    return this.sync(adapter, outgoing, now);
  }

  /** Tras un paso: los relojes segun como queda la sala, todo guardado, y los mensajes a sus sockets. */
  private async sync(adapter: RoomAdapter, outgoing: Outgoing[], now: number): Promise<void> {
    if (!this.meta) return;
    let timers = withTurnOf(this.meta.timers, adapter.awaiting(), this.meta.settings, now);
    if (adapter.status !== 'waiting') timers = doneWaiting(timers);
    this.meta.timers = withContinuation(timers, adapter.isMidway(), now);
    await this.save(adapter, this.meta);
    this.deliver(outgoing);
  }

  private save(adapter: RoomAdapter, meta: RoomMeta): Promise<void> {
    return this.host.save({ snapshot: adapter.snapshot(), meta }, nextAlarm(meta.timers));
  }

  /** Cada mensaje, a los sockets de su asiento, en orden. */
  private deliver(outgoing: readonly Outgoing[]): void {
    for (const { seat, message } of outgoing) {
      const json = JSON.stringify(message);
      for (const socket of this.socketsOf(seat)) socket.send(json);
    }
  }

  /** Los sockets abiertos de un asiento (uno que se esta cerrando puede seguir en la lista: no se le manda). */
  private socketsOf(seat: SeatId): RoomSocket[] {
    return this.host.sockets().filter((socket) => socket.isOpen && socket.attachment()?.seat === seat);
  }

  /** La sala en memoria o, si no esta, la guardada. */
  private load(): Promise<RoomAdapter | null> {
    if (this.adapter) return Promise.resolve(this.adapter);
    this.loading ??= this.recover().finally(() => (this.loading = null));
    return this.loading;
  }

  /**
   * La sala guardada, de vuelta en memoria. Las conexiones que siguen abiertas (en Cloudflare,
   * tras hibernar) vuelven a entrar con su ficha y reciben su vista entera: su punto de partida nuevo.
   */
  private async recover(): Promise<RoomAdapter | null> {
    const stored = await this.host.load();
    if (!stored) return null;
    const adapter = RoomAdapter.restore(stored.snapshot);
    if (!adapter) {
      console.error('La sala guardada no se puede recuperar: se borra');
      await this.expire();
      return null;
    }
    this.adapter = adapter;
    this.meta = stored.meta;
    await this.readmitAll(adapter);
    return adapter;
  }

  private async readmitAll(adapter: RoomAdapter): Promise<void> {
    const outgoing: Outgoing[] = [];
    for (const socket of this.host.sockets()) {
      const attachment = socket.attachment();
      if (attachment) outgoing.push(...this.readmit(socket, attachment, adapter.rejoin(attachment.token)));
    }
    await this.sync(adapter, outgoing, this.host.now());
  }

  /** Una conexion que ya habia saludado, de vuelta en la sala recuperada (si su ficha ya no vale, fuera). */
  private readmit(socket: RoomSocket, attachment: Attachment, result: JoinResult): Outgoing[] {
    if (!result.ok) {
      this.turnAway(socket, result.error);
      return [];
    }
    socket.attach({ ...attachment, connection: result.connection });
    return result.messages;
  }

  /**
   * La sala se borra entera; quien este dentro se entera por el cierre. Sale de memoria antes de
   * borrarla: lo que llegue mientras (el cierre de esas mismas conexiones) ya no la encuentra y no la vuelve a guardar.
   */
  private async expire(): Promise<void> {
    this.adapter = null;
    this.meta = null;
    for (const socket of this.host.sockets()) socket.close(CLOSE_CODES.gone, 'La sala ha caducado');
    await this.host.erase();
  }
}
