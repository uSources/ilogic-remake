/**
 * La conexion con la sala de una partida por la red: un WebSocket con los mensajes de
 * `core/net/protocol` encima, y lo que hace falta para que un corte no estropee nada.
 *
 * - Al abrirse saluda (`hello`) con la ficha del asiento y la version; el servidor contesta `welcome`
 *   con el ultimo numero de orden que atendio (`lastSeq`), desde el que se sigue contando.
 * - Cada mensaje con efecto (`act`, `endTurn`, `surrender`) lleva su numero de orden (`seq`), que se
 *   guarda en localStorage por sala y asiento: otra pestaña o una recarga sigue contando desde ahi y
 *   el servidor no repite lo ya atendido ('stale').
 * - Si la conexion se corta, vuelve a abrirse sola con esperas crecientes (`RECONNECT_MS`), saluda
 *   otra vez (el servidor manda la vista entera, que es el punto de partida nuevo) y reenvia lo que
 *   habia mandado sin contestar (el `seq` evita que se haga dos veces). Un cierre que no tiene
 *   arreglo (ficha mala, otra version, otra pestaña con la misma ficha, la sala ya no existe) no se
 *   reintenta: se avisa (`onClosed`).
 * - Lo que manda el servidor a este asiento lleva su `step`: si falta uno, se pide la vista otra vez
 *   (`resync`) y el mensaje con hueco no se entrega.
 *
 * Sin Phaser ni DOM: el socket y el reloj se le dan (`LinkDeps`), asi se prueba con un socket falso.
 */
import { CURRENT_PROTOCOL, type ClientMessage, type ServerMessage } from '../core/net';

/** Lo que se usa de un WebSocket (la clase del navegador lo cumple tal cual). */
export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface LinkDeps {
  openSocket(url: string): SocketLike;
  /** Como `setTimeout`/`clearTimeout` (en los tests, un reloj a mano). */
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Donde se guarda el numero de orden (null si no hay almacenamiento). */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** Como esta la conexion. */
export type LinkStatus = 'connecting' | 'online' | 'reconnecting' | 'closed';

/** Un cierre del servidor que no se arregla volviendo a conectar (CLOSE_CODES del servidor). */
export type FatalClose = 'badToken' | 'replaced' | 'gone' | 'badVersion' | 'other';

const FATAL_CLOSE_CODES: Readonly<Record<number, FatalClose>> = { 4401: 'badToken', 4409: 'replaced', 4410: 'gone', 4426: 'badVersion' };

/** Esperas antes de cada reintento (la ultima se repite). */
export const RECONNECT_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000, 30000];

/** Un mensaje con efecto, sin su numero (lo pone el enlace). */
export type OrderedMessage = DistributiveOmit<Extract<ClientMessage, { seq: number }>, 'seq'>;

/** `Omit` que respeta cada miembro de una union (el de serie la aplana). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface LinkListener {
  onMessage(message: ServerMessage): void;
  onStatus(status: LinkStatus): void;
  /** Se ha cerrado sin arreglo (ver `FatalClose`). */
  onClosed(reason: FatalClose): void;
}

export const seqStorageKey = (code: string, token: string): string => `ilogic.seq.${code}.${token.slice(0, 8)}`;

export class ServerLink {
  status: LinkStatus = 'connecting';
  private socket: SocketLike | null = null;
  private seq: number;
  /** Lo mandado con numero y aun sin contestar (se reenvia tras un corte). */
  private unanswered: Extract<ClientMessage, { seq: number }>[] = [];
  private lastStep = 0;
  private attempts = 0;
  private retryHandle: unknown = null;
  private isClosedByUs = false;

  constructor(
    private readonly url: string,
    private readonly code: string,
    private readonly token: string,
    private readonly listener: LinkListener,
    private readonly deps: LinkDeps,
  ) {
    this.seq = this.readSeq();
  }

  /** Abre la conexion (y saluda al abrirse). */
  connect(): void {
    this.isClosedByUs = false;
    this.open();
  }

  /** Cierra a proposito (no se reintenta). */
  close(): void {
    this.isClosedByUs = true;
    this.cancelRetry();
    this.socket?.close();
    this.socket = null;
    this.setStatus('closed');
  }

  /** Manda un mensaje con efecto con el siguiente numero de orden; devuelve ese numero. */
  send(message: OrderedMessage): number {
    this.seq += 1;
    this.writeSeq();
    const ordered = { ...message, seq: this.seq };
    this.unanswered.push(ordered);
    this.transmit(ordered);
    return this.seq;
  }

  /** Pide la vista entera otra vez (se ha perdido algo). */
  resync(): void {
    this.transmit({ kind: 'resync' });
  }

  /** El siguiente numero que se mandara sera mayor que este (para saber que es nuestro). */
  get lastSeq(): number {
    return this.seq;
  }

  // --- Por dentro --------------------------------------------------------------------------------

  private open(): void {
    const socket = this.deps.openSocket(this.url);
    this.socket = socket;
    socket.onopen = () => this.transmit({ kind: 'hello', token: this.token, ...CURRENT_PROTOCOL });
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = (event) => this.closed(socket, event.code);
    socket.onerror = () => undefined;
  }

  private transmit(message: ClientMessage): void {
    if (this.status !== 'online' && message.kind !== 'hello') return;
    this.socket?.send(JSON.stringify(message));
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    const message = parsed(raw);
    if (!message) return;
    if (message.kind === 'welcome') this.welcomed(message.lastSeq);
    if ('seq' in message && message.seq !== undefined) this.answered(message.seq);
    if (!this.followsStep(message)) return this.resync();
    this.listener.onMessage(message);
    if (message.kind === 'welcome') for (const unanswered of this.unanswered) this.transmit(unanswered);
  }

  /** Ya dentro: se sigue contando desde lo ultimo que atendio el servidor (lo no contestado se reenvia despues del saludo). */
  private welcomed(lastSeq: number): void {
    this.attempts = 0;
    // Lo que el servidor ya atendio no se reenvia: la vista que manda al saludar ya lo recoge.
    this.unanswered = this.unanswered.filter((message) => message.seq > lastSeq);
    this.seq = Math.max(this.seq, lastSeq);
    this.writeSeq();
    this.lastStep = 0;
    this.setStatus('online');
  }

  private answered(seq: number): void {
    this.unanswered = this.unanswered.filter((message) => message.seq !== seq);
  }

  /** Una vista entera es un punto de partida; lo demas tiene que llegar seguido. */
  private followsStep(message: ServerMessage): boolean {
    if (!('step' in message)) return true;
    const isInOrder = message.kind === 'view' || message.step === this.lastStep + 1;
    if (isInOrder) this.lastStep = message.step;
    return isInOrder;
  }

  private closed(socket: SocketLike, code: number): void {
    if (socket !== this.socket) return;
    this.socket = null;
    if (this.isClosedByUs) return;
    const fatal = FATAL_CLOSE_CODES[code];
    if (fatal) {
      this.setStatus('closed');
      return this.listener.onClosed(fatal);
    }
    this.setStatus('reconnecting');
    const wait = RECONNECT_MS[Math.min(this.attempts, RECONNECT_MS.length - 1)]!;
    this.attempts += 1;
    this.retryHandle = this.deps.setTimer(() => this.open(), wait);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) this.deps.clearTimer(this.retryHandle);
    this.retryHandle = null;
  }

  private setStatus(status: LinkStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listener.onStatus(status);
  }

  private readSeq(): number {
    const saved = Number(this.deps.storage?.getItem(seqStorageKey(this.code, this.token)) ?? 0);
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  }

  private writeSeq(): void {
    try {
      this.deps.storage?.setItem(seqStorageKey(this.code, this.token), String(this.seq));
    } catch {
      // Sin almacenamiento: tras una recarga se seguira desde el lastSeq del servidor.
    }
  }
}

/** El mensaje del servidor que hay en el texto, o null si no es JSON con un `kind`. */
function parsed(raw: string): ServerMessage | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === 'object' && 'kind' in value ? (value as ServerMessage) : null;
  } catch {
    return null;
  }
}

/** Las dependencias de verdad (el navegador). */
export function browserLinkDeps(): LinkDeps {
  return {
    // El WebSocket del navegador tiene esta forma (sus oyentes llevan `this`, que aqui no se usa).
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    storage: storageOrNull(),
  };
}

function storageOrNull(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
