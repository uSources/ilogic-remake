/**
 * Un cliente de prueba por WebSocket contra el Worker de verdad (`SELF`): abre la conexion de una
 * sala, manda mensajes y guarda los que llegan en una bandeja (`take` coge el primero de un tipo, o
 * espera a que llegue). Lleva dentro el cliente simulado del nucleo (`NetClient`, tests/sim), que
 * comprueba cada mensaje que llega (que nunca trae nada que su equipo no deba saber, que llegan
 * seguidos) y juega su turno con la IA del juego.
 */
import { SELF } from 'cloudflare:test';
import type { ClientMessage, ServerMessage } from '@core/net';
import { NetClient } from '../../../tests/sim/netClient';

type Kind = ServerMessage['kind'];

/** Lo que la conexion dira al cerrarse. */
export interface Closing {
  code: number;
  reason: string;
}

/** Quien espera un mensaje de uno de esos tipos. */
interface Waiter {
  kinds: readonly Kind[];
  resolve: (message: ServerMessage) => void;
}

/** La conexion de una sala, abierta (el saludo va aparte: `hello`). */
export async function openSocket(code: string, origin = 'https://usources.github.io'): Promise<WebSocket> {
  const response = await SELF.fetch(`https://servidor/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: origin } });
  if (!response.webSocket) throw new Error(`Sin WebSocket: ${response.status} ${await response.text()}`);
  response.webSocket.accept();
  return response.webSocket;
}

/** Espera a que la conexion se cierre y dice como. */
export const closingOf = (socket: WebSocket): Promise<Closing> =>
  new Promise((resolve) => socket.addEventListener('close', (event) => resolve({ code: event.code, reason: event.reason })));

export class SocketClient {
  readonly net: NetClient;
  readonly closed: Promise<Closing>;
  private readonly inbox: ServerMessage[] = [];
  private readonly waiters: Waiter[] = [];
  /** Si el cliente simulado protesta por un mensaje, el fallo sale por aqui (el `onmessage` no lo puede lanzar). */
  private failure: Error | null = null;

  private constructor(
    private readonly socket: WebSocket,
    token: string,
  ) {
    this.net = new NetClient(token);
    this.closed = closingOf(socket);
    socket.addEventListener('message', (event) => this.receive(event));
  }

  /** La conexion de la sala `code` con la ficha `token`, ya saludada (y con su bienvenida y su vista recibidas). */
  static async join(code: string, token: string): Promise<SocketClient> {
    const client = new SocketClient(await openSocket(code), token);
    client.send(client.net.hello());
    await client.take(['welcome']);
    await client.take(['view']);
    return client;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    this.socket.close(1000, 'me voy');
  }

  /** El primer mensaje de la bandeja de uno de esos tipos (los demas se quedan), o el proximo que llegue. */
  take(kinds: readonly Kind[]): Promise<ServerMessage> {
    this.check();
    const index = this.inbox.findIndex((message) => kinds.includes(message.kind));
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]!);
    return new Promise((resolve) => this.waiters.push({ kinds, resolve }));
  }

  /** Cuantos mensajes de ese tipo han llegado en total. */
  received(kind: Kind): number {
    return this.net.received.get(kind) ?? 0;
  }

  /**
   * Juega su turno con la IA del juego: cada accion espera su resultado y, si valio, los sucesos que
   * la siguen (asi su partida esta al dia antes de la siguiente).
   */
  playTurn(): Promise<void> {
    return this.net.playTurnAsync(async (_seat, message) => {
      this.send(message);
      if (message.kind !== 'act') return;
      const result = await this.take(['result']);
      if (result.kind === 'result' && result.result.ok) await this.take(['events']);
    });
  }

  private receive(event: MessageEvent): void {
    const message = JSON.parse(String(event.data)) as ServerMessage;
    try {
      this.net.receive(message);
    } catch (error) {
      this.failure ??= error instanceof Error ? error : new Error(String(error));
    }
    const waiting = this.waiters.findIndex((waiter) => waiter.kinds.includes(message.kind));
    if (waiting >= 0) this.waiters.splice(waiting, 1)[0]!.resolve(message);
    else this.inbox.push(message);
  }

  private check(): void {
    if (this.failure) throw this.failure;
  }
}

/** Los clientes de una sala juegan turnos hasta que la partida acaba o se cumple `until`. */
export async function play(clients: readonly SocketClient[], until: () => boolean): Promise<void> {
  for (;;) {
    // Cada anuncio de turno (o del final) llega a todos: se espera en todos antes de mirar a quien le toca.
    await Promise.all(clients.map((client) => client.take(['turn', 'ended'])));
    if (clients.some((client) => client.net.ended) || until()) return;
    const current = clients.find((client) => client.net.isMyTurn);
    if (!current) throw new Error('Nadie tiene el turno y la partida sigue');
    await current.playTurn();
  }
}
