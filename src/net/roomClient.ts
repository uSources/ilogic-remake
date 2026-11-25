/**
 * El cliente de una sala: convierte los mensajes del servidor (`ServerMessage`) en lo que entiende la
 * pantalla. Su partida es la vista de su equipo (`loadView` de la vista entera; `mergeView` con lo
 * que cambia en cada `events`), y lo que pasa mientras juegan los demas sale en una cola de jugadas
 * (`RoomPlay`) que la partida anima en orden: cada `events` es un lote de pasos (varios turnos de la
 * IA pueden venir juntos) que se anima contra la vista de antes (`before`: una unidad que se metio
 * en la niebla por el camino ya no esta en la de despues) y deja la de despues (`after`).
 *
 * En el turno propio, la partida manda cada accion (las decide todas el servidor) y `act` la
 * contesta con su `result` y su eco juntos: el `events` que viene detras de un `result` que vale es
 * la vista al dia tras ella, que no se anima otra vez. Lo que llega sin ser eco de nada (otro que se
 * rinde, el servidor que acaba el turno por tiempo) va a la cola como lo de cualquier paso. Una vista
 * entera solo hace de eco a lo que ya valio (su eco se perdio con un hueco) o a lo que el servidor
 * atendio sin que llegase su respuesta (se perdio en un corte: se da por bueno sin sucesos); nunca a
 * una accion aun sin respuesta, porque esa vista puede ser de antes de ella (la de un `resync`).
 *
 * Sin red ni navegador: habla con el enlace por `send`/`resync` (ServerLink, o uno falso en los tests).
 * Lo crea `OnlineMatch` (onlineMatch.ts); lo leen el vestibulo (src/menu/online/lobbyScreen.ts) y,
 * en la partida, `OnlinePlay` (src/view3d/systems/net/onlinePlay.ts).
 */
import type { GameContent } from '../core/content';
import {
  loadView,
  mergeView,
  type RoomStatus,
  type SeatId,
  type ServerMessage,
  type ServerMessageOf,
  type ViewChange,
  type ViewSnapshot,
} from '../core/net';
import type { ActionResult, GameAction, GameEvent, GameState, MatchResult, TeamId } from '../core/model';
import type { OrderedMessage } from './serverLink';

/** Por donde manda el cliente (lo que usa de `ServerLink`). */
export interface RoomSender {
  send(message: OrderedMessage): number;
  resync(): void;
}

/**
 * Cuando acaba un turno con reloj, en la hora de este navegador (ms desde 1970), y lo que dura entero.
 * El servidor dice lo que le queda; se pasa a hora de aqui al llegar, para que corra desde ya aunque
 * la jugada se atienda mas tarde (detras de lo que se este animando).
 */
export interface TurnDeadline {
  endsAt: number;
  totalMs: number;
}

/** Lo que la escena anima o atiende, en orden. */
export type RoomPlay =
  /** Un lote de pasos de los demas: se anima contra `before` y deja `after`. `actor`, el equipo del ultimo paso. */
  | { kind: 'events'; events: GameEvent[]; actor: TeamId; before: GameState; after: GameState }
  /** La vista entera otra vez (al entrar, al volver, tras un hueco): punto de partida nuevo. */
  | { kind: 'view'; state: GameState }
  /** A quien se espera, y cuando se le acaba el turno (null: la sala no tiene reloj). */
  | { kind: 'turn'; team: TeamId; day: number; deadline: TurnDeadline | null }
  | { kind: 'ended'; result: MatchResult; abandoned: boolean };

/**
 * Lo que dice el servidor de una accion: sus sucesos tal como los ve el equipo y la vista al dia tras
 * ella (su eco), o por que la sala no la atendio.
 */
export type RoomReply = { ok: true; events: GameEvent[]; state: GameState } | { ok: false; reason: string };

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
  /**
   * Las acciones que valieron y esperan su eco, con sus sucesos (por su `seq`): las contesta el
   * `events` que llega detras o, si se perdio, la siguiente vista entera.
   */
  private readonly echoDue = new Map<number, GameEvent[]>();

  /** `now`: la hora de aqui (ms desde 1970), para el reloj del turno. */
  constructor(
    private readonly sender: RoomSender,
    private readonly content: GameContent,
    private readonly listener: RoomClientListener = {},
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Ya se puede jugar: hay vista y se sabe a quien se espera (o que la partida ha acabado). */
  get isInPlay(): boolean {
    return this.state !== null && (this.turn !== null || this.ended !== null);
  }

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
        return this.answerLost(message.lastSeq);
      case 'view':
        return this.viewArrived(message.view);
      case 'events':
        return this.eventsArrived(message.events, message.actor, message.view);
      case 'result':
        return this.resultArrived(message.seq, message.result);
      case 'turn':
        return this.turnArrived(message);
      case 'ended':
        this.ended = { result: message.result, abandoned: message.abandoned };
        this.status = 'ended';
        return this.enqueue({ kind: 'ended', result: message.result, abandoned: message.abandoned });
      case 'error':
        if (message.seq !== undefined) this.reply(message.seq, { ok: false, reason: message.error });
        return;
    }
  }

  private turnArrived({ team, day, clock }: ServerMessageOf<'turn'>): void {
    this.turn = { team, day };
    this.status = 'playing';
    const deadline = clock && { endsAt: this.now() + clock.leftMs, totalMs: clock.totalMs };
    this.enqueue({ kind: 'turn', team, day, deadline });
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

  /** Si no vale, se contesta ya; si vale, cuando llegue su eco. */
  private resultArrived(seq: number, result: ActionResult): void {
    if (result.ok) this.echoDue.set(seq, result.events);
    else this.reply(seq, { ok: false, reason: result.reason });
  }

  /**
   * Lo que el servidor ya atendio (hasta `lastSeq`, al volver a entrar) y sigue sin respuesta: se perdio
   * en el corte y el enlace no lo reenvia. Se da por bueno sin sucesos que animar; lo que hizo lo trae
   * la vista que llega detras del saludo, que hace de eco.
   */
  private answerLost(lastSeq: number): void {
    const lost = [...this.replies.keys()].filter((seq) => seq <= lastSeq && !this.echoDue.has(seq));
    for (const seq of lost) this.echoDue.set(seq, []);
  }

  private viewArrived(view: ViewSnapshot): void {
    const state = this.stateOf(view);
    if (!state) return;
    this.fullView = view;
    this.state = state;
    // Tras un corte o un hueco el eco que se esperaba ya no llega: la vista entera lo sustituye.
    this.answerEchoes(state);
    this.enqueue({ kind: 'view', state });
  }

  private eventsArrived(events: GameEvent[], actor: TeamId, change: ViewChange): void {
    if (!this.fullView || !this.state) return this.sender.resync();
    const after = this.stateOf(mergeView(this.fullView, change));
    if (!after) return;
    const before = this.state;
    this.state = after;
    if (this.echoDue.size > 0) return this.answerEchoes(after);
    this.enqueue({ kind: 'events', events, actor, before, after });
  }

  /** Las acciones que esperaban su eco quedan contestadas, con la vista al dia. */
  private answerEchoes(state: GameState): void {
    for (const [seq, events] of this.echoDue) this.reply(seq, { ok: true, events, state });
    this.echoDue.clear();
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
