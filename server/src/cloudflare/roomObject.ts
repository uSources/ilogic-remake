/**
 * Una sala en Cloudflare: un Durable Object por codigo de sala (`idFromName`) con su `HostedRoom`
 * (hostedRoom.ts: todo lo que hace una sala). Aqui solo esta lo que pone Cloudflare: el almacen del
 * objeto, su unica alarma y las conexiones por el WebSocket Hibernation API (el objeto puede dormirse
 * con las conexiones abiertas: lo que hay que saber de cada una va pegado a ella, `Attachment`, y al
 * despertar la sala la recupera del almacen y las vuelve a meter).
 */
import { DurableObject } from 'cloudflare:workers';
import type { SeatId } from '@core/net';
import { HostedRoom, type ClaimResult, type CreateResult, type HandToAiResult } from '../hostedRoom';
import type { LobbyInfo } from '../roomAdapter';
import type { Attachment, RoomHost, RoomMeta, RoomSocket, StoredRoom } from '../roomHost';
import type { RoomRequest } from '../roomRequest';

export interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
  ALLOWED_ORIGINS: string;
}

const KEYS = { room: 'room', meta: 'meta' } as const;

/** Un socket de Cloudflare como conexion de la sala: lo que se sabe de el va pegado (`serializeAttachment`). */
const cloudflareSocket = (socket: WebSocket): RoomSocket => ({
  get isOpen() {
    return socket.readyState === WebSocket.READY_STATE_OPEN;
  },
  send: (text) => socket.send(text),
  close: (code, reason) => socket.close(code, reason),
  attachment: () => (socket.deserializeAttachment() as Attachment | null) ?? null,
  attach: (attachment) => socket.serializeAttachment(attachment),
});

/** Lo que el Durable Object da a su sala: su almacen, su alarma y sus sockets (tambien los que sobreviven a la hibernacion). */
class DurableHost implements RoomHost {
  /** Siempre la misma conexion para el mismo socket (la sala las compara). */
  private readonly wrapped = new WeakMap<WebSocket, RoomSocket>();

  constructor(private readonly ctx: DurableObjectState) {}

  async load(): Promise<StoredRoom | null> {
    const stored = await this.ctx.storage.get<unknown>([KEYS.room, KEYS.meta]);
    const snapshot = stored.get(KEYS.room);
    const meta = stored.get(KEYS.meta) as RoomMeta | undefined;
    return snapshot === undefined || !meta ? null : { snapshot, meta };
  }

  async save(room: StoredRoom, wakeAt: number): Promise<void> {
    await this.ctx.storage.put({ [KEYS.room]: room.snapshot, [KEYS.meta]: room.meta });
    await this.ctx.storage.setAlarm(wakeAt);
  }

  async erase(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  sockets(): RoomSocket[] {
    return this.ctx.getWebSockets().map((socket) => this.socketOf(socket));
  }

  now(): number {
    return Date.now();
  }

  socketOf(socket: WebSocket): RoomSocket {
    const known = this.wrapped.get(socket);
    if (known) return known;
    const created = cloudflareSocket(socket);
    this.wrapped.set(socket, created);
    return created;
  }
}

export class RoomObject extends DurableObject<Env> {
  private readonly host = new DurableHost(this.ctx);
  private readonly room = new HostedRoom(this.host);

  create(request: RoomRequest): Promise<CreateResult> {
    return this.room.create(request);
  }

  info(): Promise<LobbyInfo | null> {
    return this.room.info();
  }

  claimSeat(): Promise<ClaimResult> {
    return this.room.claimSeat();
  }

  handToAi(token: string, seat: SeatId): Promise<HandToAiResult> {
    return this.room.handToAi(token, seat);
  }

  /** La subida a WebSocket (lo unico que llega por fetch: lo demas va por RPC). El saludo viene despues, como primer mensaje. */
  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba una subida a WebSocket', { status: 426 });
    if (!(await this.room.exists())) return new Response('No hay tal sala', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    return this.room.receive(this.host.socketOf(socket), raw);
  }

  override async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    await this.room.forget(this.host.socketOf(socket));
    try {
      socket.close(code, reason);
    } catch {
      // Ya estaba cerrado del todo.
    }
  }

  override webSocketError(socket: WebSocket): Promise<void> {
    return this.room.forget(this.host.socketOf(socket));
  }

  /** Ha vencido el primer reloj de la sala. */
  override alarm(): Promise<void> {
    return this.room.ring();
  }
}
