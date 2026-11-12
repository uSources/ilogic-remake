import { expect } from 'vitest';
import { aiTurn, defaultAiProfile } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { cloneState } from '@core/gameContent';
import type { ActionResult, GameEvent, GameState, MatchResult, TeamId } from '@core/model';
import {
  CURRENT_PROTOCOL,
  loadView,
  mergeView,
  type ClientMessage,
  type Outgoing,
  type Room,
  type SeatId,
  type ServerMessage,
  type ViewSnapshot,
} from '@core/net';
import { decisionRngOf, playerView, type PlayerView } from '@core/playerView';
import { expectFoggedView, expectReferencesKnown } from './viewChecks';

/**
 * Un cliente simulado de una partida por la red: solo sabe lo que le llega por mensajes (su vista y
 * los sucesos que ve), construye su partida con `loadView` y juega su turno con la IA del juego sobre
 * esa partida (asi usa toda clase de acciones sin saber nada del servidor). Comprueba en cada mensaje
 * que nunca le llega nada que su equipo no deba saber, que los mensajes llegan seguidos (`step`) y
 * que cada resultado contesta a lo que mando (`seq`).
 */
export class NetClient {
  seat: SeatId | null = null;
  team: TeamId | null = null;
  connection: number | null = null;
  /** Su partida, tal como la sabe (la ultima vista). El mismo objeto toda la partida: se rellena con cada vista. */
  state: GameState | null = null;
  /** La ultima vista entera que le llego (lo fijo de la partida sale de ella). */
  private fullView: ViewSnapshot | null = null;
  private view: PlayerView | null = null;
  /** A quien se espera, segun el servidor. */
  turn: { team: TeamId; day: number } | null = null;
  ended: MatchResult | null = null;
  lastResult: ActionResult | null = null;
  /** Los sucesos del ultimo resultado, por comprobar contra la vista que viene detras. */
  private resultEvents: GameEvent[] = [];
  /** Su numero de orden: uno mas por cada mensaje con efecto. */
  seq = 0;
  /** El ultimo `step` que le llego (los siguientes tienen que ser el siguiente). */
  step = 0;
  /** Cuantos mensajes de cada tipo han llegado. */
  readonly received = new Map<ServerMessage['kind'], number>();
  /** Bytes recibidos (como JSON). */
  bytes = 0;

  constructor(readonly token: string) {}

  /** El saludo con el que entra. */
  hello(): ClientMessage {
    return { kind: 'hello', token: this.token, ...CURRENT_PROTOCOL };
  }

  /** Un mensaje con efecto, con el siguiente numero de orden. */
  ordered<Message extends Omit<Extract<ClientMessage, { seq: number }>, 'seq'>>(message: Message): Message & { seq: number } {
    this.seq += 1;
    return { ...message, seq: this.seq };
  }

  /** Un mensaje del servidor: lo apunta, comprueba lo que trae y pone al dia su partida. */
  receive(message: ServerMessage): void {
    this.received.set(message.kind, (this.received.get(message.kind) ?? 0) + 1);
    this.bytes += JSON.stringify(message).length;
    // Una vista entera es un punto de partida (al entrar, al volver); lo demas tiene que llegar seguido.
    if ('step' in message && message.kind !== 'view')
      expect(message.step, `falta un mensaje antes del ${message.kind}`).toBe(this.step + 1);
    if ('step' in message) this.step = message.step;
    switch (message.kind) {
      case 'welcome':
        this.seat = message.seat;
        this.team = message.team;
        // Un cliente nuevo en un asiento usado sigue contando desde donde lo dejo el de antes.
        expect(message.lastSeq).toBeGreaterThanOrEqual(this.seq);
        this.seq = message.lastSeq;
        return;
      case 'view':
        this.fullView = message.view;
        this.replaceState(message.view);
        return;
      case 'events': {
        const before = this.state ? cloneState(this.state) : null;
        if (!this.fullView) throw new Error('Sucesos sin una vista entera antes');
        this.replaceState(mergeView(this.fullView, message.view));
        if (before) expectReferencesKnown([...this.resultEvents, ...message.events], before, this.state!, this.team!);
        this.resultEvents = [];
        return;
      }
      case 'result':
        expect(message.seq, 'un resultado de otro mensaje').toBe(this.seq);
        // Llega antes que lo que ha cambiado: sus sucesos se comprueban con la vista que viene detras.
        if (message.result.ok) this.resultEvents = message.result.events;
        this.lastResult = message.result;
        return;
      case 'turn':
        this.turn = { team: message.team, day: message.day };
        return;
      case 'ended':
        this.ended = message.result;
        return;
      case 'error':
        throw new Error(`El servidor ha rechazado un mensaje del equipo ${this.team}: ${message.error}`);
    }
  }

  /** Lo que le toca de `outgoing`. */
  receiveAll(outgoing: readonly Outgoing[]): void {
    for (const { seat, message } of outgoing) if (seat === this.seat) this.receive(message);
  }

  /** Es su turno (el servidor le espera). */
  get isMyTurn(): boolean {
    return this.turn !== null && this.turn.team === this.team && this.ended === null;
  }

  /**
   * Juega su turno con la IA del juego sobre su partida: manda cada accion que propone y le contesta
   * con el resultado que da el servidor; al acabar, el fin de turno. `exchange` manda un mensaje y da
   * lo que el servidor responde (ya repartido a todos los clientes, este incluido).
   */
  playTurn(exchange: (seat: SeatId, message: ClientMessage) => Outgoing[]): void {
    if (this.seat === null || !this.state) throw new Error('El cliente no ha entrado');
    // Una vista por turno, como hace la sesion (su azar es el del turno).
    this.view = playerView(this.state, this.team!);
    const plan = aiTurn(this.view, defaultAiProfile(defaultContent()), decisionRngOf(this.view));
    for (let step = plan.next(); !step.done;) {
      this.lastResult = null;
      exchange(this.seat, this.ordered({ kind: 'act', action: step.value }));
      if (!this.lastResult) throw new Error('El servidor no ha contestado a una accion');
      step = plan.next(this.lastResult);
    }
    exchange(this.seat, this.ordered({ kind: 'endTurn' }));
  }

  /** Su partida pasa a ser la vista: comprobada como una partida guardada, y sin nada que no deba saber. */
  private replaceState(snapshot: unknown): void {
    const read = loadView(snapshot, defaultContent());
    if (!read.ok) throw new Error(`La vista no se puede leer: ${read.error}`);
    expectFoggedView(read.state, this.team!);
    if (!this.state) {
      this.state = read.state;
      return;
    }
    // El mismo objeto, para que la vista (y el plan de la IA que la mira) sigan valiendo.
    for (const key of Object.keys(this.state)) delete (this.state as unknown as Record<string, unknown>)[key];
    Object.assign(this.state, read.state);
    this.view?.refresh();
  }
}

/** Una sala con sus clientes: reparte cada mensaje que sale a quien va. */
export class Table {
  readonly clients: NetClient[];

  constructor(
    readonly room: Room,
    tokens: readonly string[],
  ) {
    this.clients = tokens.map((token) => new NetClient(token));
  }

  deliver(outgoing: readonly Outgoing[]): void {
    for (const client of this.clients) client.receiveAll(outgoing);
  }

  /** Entra un cliente (con su saludo). */
  join(client: NetClient): void {
    const result = this.room.join(client.hello());
    if (!result.ok) throw new Error(`No ha podido entrar: ${result.error}`);
    client.seat = result.seat;
    client.connection = result.connection;
    this.deliver(result.messages);
  }

  /** Entra cada cliente. */
  joinAll(): void {
    for (const client of this.clients) this.join(client);
  }

  /** Manda un mensaje de un asiento y reparte lo que sale. */
  readonly exchange = (seat: SeatId, message: ClientMessage): Outgoing[] => {
    const outgoing = this.room.handle(seat, message);
    this.deliver(outgoing);
    return outgoing;
  };

  /** El cliente al que le toca, o null si no se espera a ninguno (la partida ha acabado). */
  whoseTurn(): NetClient | null {
    return this.clients.find((client) => client.isMyTurn) ?? null;
  }

  /** Juega turnos hasta que la partida acaba o se cumple `until`. */
  play(until: (room: Room) => boolean): void {
    for (;;) {
      if (this.room.status === 'ended' || until(this.room)) return;
      const client = this.whoseTurn();
      expect(client, 'nadie tiene el turno y la partida sigue').not.toBeNull();
      client!.playTurn(this.exchange);
    }
  }
}

/** Fichas de prueba, distintas y previsibles. */
export function tokenCounter(prefix = 'ficha'): (bytes: number) => string {
  let count = 0;
  return (bytes) => `${prefix}-${bytes}-${++count}`;
}
