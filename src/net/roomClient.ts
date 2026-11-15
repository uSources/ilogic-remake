/**
 * El cliente de una sala: convierte los mensajes del servidor (`ServerMessage`) en lo que entiende la
 * pantalla. Su partida es la vista de su equipo (`loadView` de la vista entera; `mergeView` con lo
 * que cambia en cada `events`), y lo que pasa mientras juegan los demas sale en una cola de jugadas
 * (`RoomPlay`) que la escena anima en orden: cada `events` es un lote de pasos (varios turnos de la
 * IA pueden venir juntos) que se anima contra la vista de antes (`before`: una unidad que se metio
 * en la niebla por el camino ya no esta en la de despues) y deja la de despues (`after`).
 *
 * En el turno propio, la escena hace cada accion en su copia de la partida (la vista) y la manda; el
 * `result` del servidor contesta a esa accion (`act` devuelve una promesa con el) y el `events` que
 * viene detras es su eco: la vista al dia, que se da a quien la espera (`nextEcho`) y no se anima
 * otra vez. Lo que llega sin ser eco de nada (otro que se rinde, el servidor que acaba el turno por
 * tiempo) va a la cola como lo de cualquier paso.
 *
 * Sin red ni Phaser: habla con el enlace por `send`/`resync` (ServerLink, o uno falso en los tests).
 * Lo crea `OnlineMatch` (onlineMatch.ts); lo leen el vestibulo (src/menu/online/lobbyScreen.ts) y,
 * en la partida, `OnlinePlay` (src/scenes/game/onlinePlay.ts).
 */
import type { GameContent } from '../core/content';
import { loadView, mergeView, type RoomStatus, type SeatId, type ServerMessage, type ViewChange, type ViewSnapshot } from '../core/net';
import type { ActionResult, GameAction, GameEvent, GameState, MatchResult, TeamId } from '../core/model';
import type { OrderedMessage } from './serverLink';

/** Por donde manda el cliente (lo que usa de `ServerLink`). */
export interface RoomSender {
  send(message: OrderedMessage): number;
  resync(): void;
}

/** Lo que la escena anima o atiende, en orden. */
export type RoomPlay =
  /** Un lote de pasos de los demas: se anima contra `before` y deja `after`. `actor`, el equipo del ultimo paso. */
  | { kind: 'events'; events: GameEvent[]; actor: TeamId; before: GameState; after: GameState }
  /** La vista entera otra vez (al entrar, al volver, tras un hueco): punto de partida nuevo. */
  | { kind: 'view'; state: GameState }
  /** A quien se espera. */
  | { kind: 'turn'; team: TeamId; day: number }
  | { kind: 'ended'; result: MatchResult; abandoned: boolean };

/** Lo que dice el servidor de una accion: lo que diria la partida, o por que la sala no la atendio. */
export type RoomReply = { ok: true; events: GameEvent[] } | { ok: false; reason: string };

export interface RoomClientListener {
  /** Hay una jugada nueva en la cola (la escena la saca con `next` cuando le toca). */
  onPlay?(play: RoomPlay): void;
}

export class RoomClient {
  seat: SeatId | null = null;
  team: TeamId | null = null;
  status: RoomStatus = 'waiting';
  /** La partida tal como la sabe este equipo (la ultima vista del servidor). */
  state: GameState | null = null;
  turn: { team: TeamId; day: number } | null = null;
  ended: { result: MatchResult; abandoned: boolean } | null = null;
  private fullView: ViewSnapshot | null = null;
  private readonly queue: RoomPlay[] = [];
  private waiting: ((play: RoomPlay) => void) | null = null;
  private readonly replies = new Map<number, (reply: RoomReply) => void>();
  /** Respuestas que llegaron antes de que nadie las esperase (el enlace contesta en el acto en los tests). */
  private readonly unclaimed = new Map<number, RoomReply>();
  /** Un `result` que valio deja un eco por llegar (el `events` con la vista al dia). */
  private echoDue = false;
  private echoWaiters: ((state: GameState) => void)[] = [];

  constructor(
    private readonly sender: RoomSender,
    private readonly content: GameContent,
    private readonly listener: RoomClientListener = {},
  ) {}

  /** La sala espera a este equipo. */
  get isMyTurn(): boolean {
    return this.status === 'playing' && this.turn !== null && this.turn.team === this.team && this.ended === null;
  }

  /** Una accion del equipo propio: lo que diga el servidor. */
  act(action: GameAction): Promise<RoomReply> {
    if (action.kind === 'surrender') return this.ordered({ kind: 'surrender' });
    return this.ordered({ kind: 'act', action });
  }

  /** Acaba el turno (la sala no contesta con un `result`: lo que sigue llega como jugadas). */
  endTurn(): void {
    this.echoDue = false;
    this.sender.send({ kind: 'endTurn' });
  }

  resync(): void {
    this.sender.resync();
  }

  /** La siguiente jugada de la cola (espera si no hay). */
  next(): Promise<RoomPlay> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => (this.waiting = resolve));
  }

  /** La vista al dia tras la ultima accion propia (su eco), cuando llegue. */
  nextEcho(): Promise<GameState> {
    return new Promise((resolve) => this.echoWaiters.push(resolve));
  }

  /** Hay jugadas sin atender. */
  get hasPending(): boolean {
    return this.queue.length > 0;
  }

  /** Un mensaje del servidor. */
  receive(message: ServerMessage): void {
    switch (message.kind) {
      case 'welcome':
        this.seat = message.seat;
        this.team = message.team;
        this.status = message.status;
        return;
      case 'view':
        return this.viewArrived(message.view);
      case 'events':
        return this.eventsArrived(message.events, message.actor, message.view);
      case 'result':
        return this.resultArrived(message.seq, message.result);
      case 'turn':
        this.turn = { team: message.team, day: message.day };
        this.status = 'playing';
        this.echoDue = false;
        return this.enqueue({ kind: 'turn', team: message.team, day: message.day });
      case 'ended':
        this.ended = { result: message.result, abandoned: message.abandoned };
        this.status = 'ended';
        return this.enqueue({ kind: 'ended', result: message.result, abandoned: message.abandoned });
      case 'error':
        if (message.seq !== undefined) this.reply(message.seq, { ok: false, reason: message.error });
        return;
    }
  }

  private ordered(message: OrderedMessage): Promise<RoomReply> {
    const seq = this.sender.send(message);
    const early = this.unclaimed.get(seq);
    if (early) {
      this.unclaimed.delete(seq);
      return Promise.resolve(early);
    }
    return new Promise((resolve) => this.replies.set(seq, resolve));
  }

  private reply(seq: number, reply: RoomReply): void {
    const resolve = this.replies.get(seq);
    this.replies.delete(seq);
    if (resolve) resolve(reply);
    else this.unclaimed.set(seq, reply);
  }

  private resultArrived(seq: number, result: ActionResult): void {
    this.echoDue = result.ok;
    this.reply(seq, result.ok ? { ok: true, events: result.events } : { ok: false, reason: result.reason });
  }

  private viewArrived(view: ViewSnapshot): void {
    const state = this.stateOf(view);
    if (!state) return;
    this.fullView = view;
    this.state = state;
    this.echoDue = false;
    this.enqueue({ kind: 'view', state });
  }

  private eventsArrived(events: GameEvent[], actor: TeamId, change: ViewChange): void {
    if (!this.fullView || !this.state) return this.sender.resync();
    const after = this.stateOf(mergeView(this.fullView, change));
    if (!after) return;
    const before = this.state;
    this.state = after;
    if (this.echoDue) {
      this.echoDue = false;
      const waiters = this.echoWaiters;
      this.echoWaiters = [];
      for (const waiter of waiters) waiter(after);
      return;
    }
    this.enqueue({ kind: 'events', events, actor, before, after });
  }

  /** La partida de una vista; si no se puede leer (otra version, algo roto), se pide otra vez. */
  private stateOf(view: ViewSnapshot): GameState | null {
    const read = loadView(view, this.content);
    if (read.ok) return read.state;
    this.sender.resync();
    return null;
  }

  private enqueue(play: RoomPlay): void {
    const waiting = this.waiting;
    this.waiting = null;
    if (waiting) waiting(play);
    else this.queue.push(play);
    this.listener.onPlay?.(play);
  }
}

/**
 * La partida con la que se anima un lote: la de despues (las unidades que siguen estan donde acaban,
 * como en la pantalla de siempre) mas las que solo estan en la de antes (las que cayeron o se
 * metieron en la niebla por el camino: sin ellas no habria dibujo que animar). Solo para dibujar.
 */
export function animationView(before: GameState, after: GameState): GameState {
  const kept = new Set(after.units.map((unit) => unit.uid));
  const gone = before.units.filter((unit) => !kept.has(unit.uid));
  return gone.length ? { ...after, units: [...after.units, ...gone] } : after;
}

/** Las jugadas de un lote por turnos: los sucesos de cada turno que empieza, con su equipo (lo de antes del primero, sin equipo). */
export function splitByTurn(events: GameEvent[]): { team: TeamId | null; events: GameEvent[] }[] {
  const chunks: { team: TeamId | null; events: GameEvent[] }[] = [{ team: null, events: [] }];
  for (const event of events) {
    if (event.kind === 'turnStart') chunks.push({ team: event.actor, events: [] });
    chunks[chunks.length - 1]!.events.push(event);
  }
  return chunks.filter((chunk) => chunk.events.length > 0);
}
