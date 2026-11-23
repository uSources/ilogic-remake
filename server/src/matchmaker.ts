/**
 * El emparejador de «Buscar rival»: una cola por ritmo con las salas que esperan a alguien. Quien
 * busca se queda con el asiento libre de la primera que vale (la sala empieza en cuanto cada asiento
 * es de alguien, `start: 'everyoneSeated'`, este dentro o no quien la abrio); si no hay ninguna, se
 * le abre una sala suya, que entra en la cola. Las salas de la busqueda son todas iguales (1 contra 1,
 * las reglas de siempre y mapa al azar, con el ritmo de `PACE_RULES`): dos que buscan el mismo ritmo
 * siempre se valen.
 *
 * Hay uno para todo el servidor: en Cloudflare, un Durable Object (cloudflare/matchmakerObject.ts);
 * en Node, uno en el proceso. La cola se guarda tras cada busqueda (`MatchQueueStore`) y las
 * busquedas van de una en una: dos a la vez partirian de la misma cola y la que guardase despues
 * borraria lo que hizo la otra.
 */
import type { TeamId } from '@core/model';
import { isRoomCode, isSearchPace, MAX_AVOIDED_ROOMS, PACE_RULES, SEARCH_PACES, type SearchPace } from '@core/net';
import { isObject } from '@core/util/validation';
import { newSeed } from './codes';
import { LIVE_ABSENCE_GRACE_MS, MAX_SEARCH_CANDIDATES, MAX_SEARCHES_PER_WINDOW, MAX_WAITING_ROOMS, SEARCH_WINDOW_MS } from './limits';
import { RequestLimit } from './rateLimit';
import type { LobbyInfo } from './roomAdapter';
import { createRoomWithFreeCode, seatTicket, type NewRoomError, type RoomDirectory, type SeatTicket } from './roomDirectory';
import type { RoomRequest } from './roomRequest';

/** Lo que pide quien busca: el ritmo y sus salas (las que ya tiene: que no le toque la suya). */
export interface SearchRequest {
  pace: SearchPace;
  avoid: string[];
}

/** Por que no se ha buscado: demasiadas busquedas seguidas desde esa direccion, o no se ha podido abrir sala. */
export type SearchError = 'tooManySearches' | NewRoomError;

/** El asiento de quien busca y si ya tiene rival (`matched`) o es su sala, esperando a alguien. */
export type SearchResult = { ok: true; ticket: SeatTicket; matched: boolean } | { ok: false; error: SearchError };

/** Quien atiende las busquedas (el emparejador, o en Cloudflare el objeto que lo tiene). */
export interface RivalSearch {
  /** `client` es la direccion de quien busca: el tope de busquedas es por direccion. */
  search(client: string, request: SearchRequest): Promise<SearchResult>;
}

/** Una sala de la cola y, en vivo, desde cuando se ve que quien la abrio no esta en ella (null: esta, o no se ha mirado). */
export interface QueuedRoom {
  code: string;
  absentSince: number | null;
}

export type MatchQueue = Record<SearchPace, QueuedRoom[]>;

/** Donde se guarda la cola (lo que se lee es de fuera: se comprueba al cargarlo). */
export interface MatchQueueStore {
  load(): Promise<unknown>;
  save(queue: MatchQueue): Promise<void>;
}

const REQUEST_FIELDS = ['pace', 'avoid'];

const isAvoidList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= MAX_AVOIDED_ROOMS && value.every(isRoomCode);

/** Lo que pide quien busca, si tiene la forma que toca (`avoid` puede faltar); si no, null. */
export function searchRequestOf(body: unknown): SearchRequest | null {
  if (!isObject(body) || !Object.keys(body).every((field) => REQUEST_FIELDS.includes(field))) return null;
  const avoid = body.avoid ?? [];
  return isSearchPace(body.pace) && isAvoidList(avoid) ? { pace: body.pace, avoid } : null;
}

/** El equipo del rival que llega: juega primero, porque esta delante (quien abrio la sala quiza no). */
const ARRIVING_TEAM: TeamId = 1;

/** La sala de una busqueda: 1 contra 1, las reglas de siempre, el mapa de esa semilla con tema al azar y el reloj del ritmo. */
export function searchRoomRequest(pace: SearchPace, seed: number): RoomRequest {
  const rules = PACE_RULES[pace];
  const teams = [{ controller: 'human' as const }, { controller: 'human' as const }];
  return {
    match: { seed, size: rules.mapSize, theme: null, teams, firstTeam: ARRIVING_TEAM },
    turnSeconds: rules.turnSeconds,
    start: 'everyoneSeated',
  };
}

const emptyQueue = (): MatchQueue => ({ daily: [], live: [] });

const isQueuedRoom = (value: unknown): value is QueuedRoom =>
  isObject(value) && isRoomCode(value.code) && (value.absentSince === null || typeof value.absentSince === 'number');

/** La cola guardada; lo que no tenga la forma de una sala de la cola se tira (como mucho, alguien deja de esperar). */
function queueOf(stored: unknown): MatchQueue {
  const queue = emptyQueue();
  if (!isObject(stored)) return queue;
  for (const pace of SEARCH_PACES) {
    const rooms = stored[pace];
    if (Array.isArray(rooms)) queue[pace] = rooms.filter(isQueuedRoom);
  }
  return queue;
}

/** Si quien abrio la sala (el primer asiento de una persona) esta dentro. */
const isOpenerIn = (info: LobbyInfo): boolean => info.seats.find((seat) => seat.kind === 'person')?.joined === true;

/** Que hacer con una sala de la cola: darle el asiento a quien busca, dejarla para luego o sacarla de la cola. */
type Verdict = 'take' | 'keep' | 'drop';

function removeFrom(waiting: QueuedRoom[], room: QueuedRoom): void {
  waiting.splice(waiting.indexOf(room), 1);
}

export class Matchmaker implements RivalSearch {
  private queue: MatchQueue | null = null;
  /** La busqueda en curso: la siguiente empieza cuando acaba. */
  private running: Promise<unknown> = Promise.resolve();
  private readonly searches = new RequestLimit(MAX_SEARCHES_PER_WINDOW, SEARCH_WINDOW_MS);

  constructor(
    private readonly rooms: RoomDirectory,
    private readonly store: MatchQueueStore,
    private readonly now: () => number = Date.now,
  ) {}

  search(client: string, request: SearchRequest): Promise<SearchResult> {
    const result = this.running.then(() => this.searchNow(client, request));
    this.running = result.catch(() => undefined);
    return result;
  }

  private async searchNow(client: string, request: SearchRequest): Promise<SearchResult> {
    if (!this.searches.allows(client, this.now())) return { ok: false, error: 'tooManySearches' };
    const queue = await this.loadedQueue();
    const waiting = queue[request.pace];
    const result = (await this.takeWaitingSeat(waiting, request)) ?? (await this.openRoom(waiting, request.pace));
    await this.store.save(queue);
    return result;
  }

  private async loadedQueue(): Promise<MatchQueue> {
    this.queue ??= queueOf(await this.store.load());
    return this.queue;
  }

  /** El asiento libre de la primera sala de la cola que vale (no una de quien busca); las que ya no valen salen de la cola. */
  private async takeWaitingSeat(waiting: QueuedRoom[], request: SearchRequest): Promise<SearchResult | null> {
    const candidates = waiting.filter((room) => !request.avoid.includes(room.code)).slice(0, MAX_SEARCH_CANDIDATES);
    for (const room of candidates) {
      const verdict = await this.verdictOn(room, request.pace);
      if (verdict === 'keep') continue;
      removeFrom(waiting, room);
      const claimed = verdict === 'take' ? await this.rooms.claimSeat(room.code) : null;
      if (claimed?.ok) return { ok: true, ticket: seatTicket(room.code, claimed.seat), matched: true };
    }
    return null;
  }

  /**
   * Una sala que ya no espera (o ya no existe) sale de la cola. En vivo, ademas, quien la abrio tiene
   * que estar dentro: si no esta, se deja un rato (puede estar recargando la pagina) y despues sale.
   */
  private async verdictOn(room: QueuedRoom, pace: SearchPace): Promise<Verdict> {
    const info = await this.rooms.info(room.code);
    if (info?.status !== 'waiting') return 'drop';
    if (!PACE_RULES[pace].needsSearcherIn || isOpenerIn(info)) {
      room.absentSince = null;
      return 'take';
    }
    room.absentSince ??= this.now();
    return this.now() - room.absentSince < LIVE_ABSENCE_GRACE_MS ? 'keep' : 'drop';
  }

  /** Nadie espera: una sala nueva para quien busca, que entra en la cola (si se pasa del tope, sale la mas vieja). */
  private async openRoom(waiting: QueuedRoom[], pace: SearchPace): Promise<SearchResult> {
    const created = await createRoomWithFreeCode(this.rooms, searchRoomRequest(pace, newSeed()));
    if (!created.ok) return created;
    waiting.push({ code: created.ticket.code, absentSince: null });
    if (waiting.length > MAX_WAITING_ROOMS) waiting.shift();
    return { ok: true, ticket: created.ticket, matched: false };
  }
}
