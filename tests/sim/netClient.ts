import { expect } from 'vitest';
import { aiTurn, defaultAiProfile } from '@core/ai';
import { defaultContent } from '@core/content/default';
import { cloneState } from '@core/gameContent';
import type { ActionResult, GameState, MatchResult, TeamId } from '@core/model';
import { CURRENT_PROTOCOL, loadView, type ClientMessage, type Outgoing, type Room, type SeatId, type ServerMessage } from '@core/net';
import { decisionRngOf, playerView, type PlayerView } from '@core/playerView';
import { expectFoggedView, expectReferencesKnown } from './viewChecks';

/**
 * Un cliente simulado de una partida por la red: solo sabe lo que le llega por mensajes (su vista y
 * los sucesos que ve), construye su partida con `loadView` y juega su turno con la IA del juego sobre
 * esa partida (asi usa toda clase de acciones sin saber nada del servidor). Comprueba en cada mensaje
 * que nunca le llega nada que su equipo no deba saber.
 */
export class NetClient {
  seat: SeatId | null = null;
  team: TeamId | null = null;
  /** Su partida, tal como la sabe (la ultima vista). El mismo objeto toda la partida: se rellena con cada vista. */
  state: GameState | null = null;
  private view: PlayerView | null = null;
  /** A quien se espera, segun el servidor. */
  turn: { team: TeamId; day: number } | null = null;
  ended: MatchResult | null = null;
  lastResult: ActionResult | null = null;
  /** Cuantos mensajes de cada tipo han llegado. */
  readonly received = new Map<ServerMessage['kind'], number>();

  constructor(readonly token: string) {}

  /** El saludo con el que entra. */
  hello(): ClientMessage {
    return { kind: 'hello', token: this.token, ...CURRENT_PROTOCOL };
  }

  /** Un mensaje del servidor: lo apunta, comprueba lo que trae y pone al dia su partida. */
  receive(message: ServerMessage): void {
    this.received.set(message.kind, (this.received.get(message.kind) ?? 0) + 1);
    switch (message.kind) {
      case 'welcome':
        this.seat = message.seat;
        this.team = message.team;
        return;
      case 'view':
        this.replaceState(message.view);
        return;
      case 'events': {
        const before = this.state ? cloneState(this.state) : null;
        this.replaceState(message.view);
        if (before) expectReferencesKnown(message.events, before, this.state!, this.team!);
        return;
      }
      case 'result':
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
      exchange(this.seat, { kind: 'act', action: step.value });
      if (!this.lastResult) throw new Error('El servidor no ha contestado a una accion');
      step = plan.next(this.lastResult);
    }
    exchange(this.seat, { kind: 'endTurn' });
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

  /** Entra cada cliente (con su saludo). */
  joinAll(): void {
    for (const client of this.clients) {
      const result = this.room.join(client.hello());
      if (!result.ok) throw new Error(`No ha podido entrar: ${result.error}`);
      client.seat = result.seat;
      this.deliver(result.messages);
    }
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
