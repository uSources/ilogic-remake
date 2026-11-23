import { describe, expect, it } from 'vitest';
import { CURRENT_PROTOCOL, MAX_AVOIDED_ROOMS, PACE_RULES } from '@core/net';
import { HostedRoom } from '../../src/hostedRoom';
import { LIVE_ABSENCE_GRACE_MS, MAX_SEARCHES_PER_WINDOW, SEARCH_WINDOW_MS } from '../../src/limits';
import {
  Matchmaker,
  searchRequestOf,
  type MatchQueue,
  type MatchQueueStore,
  type SearchRequest,
  type SearchResult,
} from '../../src/matchmaker';
import type { RoomDirectory } from '../../src/roomDirectory';
import type { Attachment, RoomHost, RoomSocket, StoredRoom } from '../../src/roomHost';
import type { RoomRequest } from '../../src/roomRequest';

/** Una conexion de mentira: guarda lo que se le pega y se puede cerrar. */
class MemorySocket implements RoomSocket {
  isOpen = true;
  private attached: Attachment | null = null;

  send(): void {}

  close(): void {
    this.isOpen = false;
  }

  attachment(): Attachment | null {
    return this.attached;
  }

  attach(attachment: Attachment): void {
    this.attached = attachment;
  }
}

/** Lo que aloja una sala en memoria: su guardado y sus conexiones. */
class MemoryHost implements RoomHost {
  readonly connections: MemorySocket[] = [];
  private stored: StoredRoom | null = null;

  constructor(readonly now: () => number) {}

  load(): Promise<StoredRoom | null> {
    return Promise.resolve(this.stored);
  }

  save(room: StoredRoom): Promise<void> {
    this.stored = room;
    return Promise.resolve();
  }

  erase(): Promise<void> {
    this.stored = null;
    return Promise.resolve();
  }

  sockets(): readonly RoomSocket[] {
    return this.connections;
  }
}

/** Las salas de verdad (`HostedRoom`), en memoria, con una forma de entrar en ellas como por el WebSocket. */
class MemoryRooms implements RoomDirectory {
  /** Pedir asiento falla (como si se cayera la sala a media peticion). */
  failClaims = false;
  private readonly rooms = new Map<string, { host: MemoryHost; room: HostedRoom }>();

  constructor(private readonly now: () => number) {}

  async create(code: string, request: RoomRequest) {
    if (this.rooms.has(code)) return { ok: false, error: 'exists' } as const;
    const host = new MemoryHost(this.now);
    const room = new HostedRoom(host);
    this.rooms.set(code, { host, room });
    return room.create(request);
  }

  info(code: string) {
    return this.entryOf(code).room.info();
  }

  claimSeat(code: string) {
    if (this.failClaims) return Promise.reject(new Error('La sala no contesta'));
    return this.entryOf(code).room.claimSeat();
  }

  handToAi(code: string, token: string, seat: number) {
    return this.entryOf(code).room.handToAi(token, seat);
  }

  close(code: string, token: string) {
    return this.entryOf(code).room.close(token);
  }

  connect(): Promise<Response> {
    return Promise.resolve(new Response(null, { status: 426 }));
  }

  /** Quien tiene esa ficha entra en la sala (como por el WebSocket: saluda con ella). */
  async enter(code: string, token: string): Promise<void> {
    const { host, room } = this.entryOf(code);
    const socket = new MemorySocket();
    host.connections.push(socket);
    await room.receive(socket, JSON.stringify({ kind: 'hello', token, ...CURRENT_PROTOCOL }));
  }

  /** Una sala que no existe es una vacia (como un Durable Object al que se llama por primera vez). */
  private entryOf(code: string): { host: MemoryHost; room: HostedRoom } {
    return this.rooms.get(code) ?? { host: new MemoryHost(this.now), room: new HostedRoom(new MemoryHost(this.now)) };
  }
}

/** Donde se guarda la cola: en memoria, como JSON (lo que se lee es de fuera, como de un fichero). */
class MemoryQueueStore implements MatchQueueStore {
  text: string | null = null;

  load(): Promise<unknown> {
    return Promise.resolve(this.text === null ? undefined : JSON.parse(this.text));
  }

  save(queue: MatchQueue): Promise<void> {
    this.text = JSON.stringify(queue);
    return Promise.resolve();
  }
}

/** Un emparejador con salas en memoria y una hora que se adelanta a mano. */
function setUp() {
  const clock = { now: 1_000_000 };
  const rooms = new MemoryRooms(() => clock.now);
  const store = new MemoryQueueStore();
  const matchmaker = new Matchmaker(rooms, store, () => clock.now);
  return { clock, rooms, store, matchmaker };
}

const MS_PER_SECOND = 1000;

const DAILY: SearchRequest = { pace: 'daily', avoid: [] };
const LIVE: SearchRequest = { pace: 'live', avoid: [] };

/** El asiento que da una busqueda que tenia que ir bien. */
function ticketOf(result: SearchResult) {
  if (!result.ok) throw new Error(`La busqueda ha fallado: ${result.error}`);
  return { ...result.ticket, matched: result.matched };
}

describe('el emparejador', () => {
  it('el primero que busca abre su sala y espera; el segundo se queda el otro asiento y la partida empieza, aunque el primero no este dentro', async () => {
    const { rooms, matchmaker } = setUp();
    const opener = ticketOf(await matchmaker.search('a', DAILY));
    expect(opener).toMatchObject({ seat: 0, team: 0, matched: false });
    expect((await rooms.info(opener.code))?.status).toBe('waiting');
    const rival = ticketOf(await matchmaker.search('b', DAILY));
    expect(rival).toMatchObject({ code: opener.code, seat: 1, team: 1, matched: true });
    const info = await rooms.info(opener.code);
    expect(info?.status).toBe('playing');
    // Empieza quien llega (esta delante), con el reloj del ritmo.
    expect(info?.turn).toMatchObject({ seat: 1, day: 1 });
    expect(info?.turn?.endsAt).toBeGreaterThan(0);
    // La sala ya no espera a nadie: el siguiente abre otra.
    expect(ticketOf(await matchmaker.search('c', DAILY)).matched).toBe(false);
  });

  it('cada ritmo tiene su cola, y a quien busca no le toca una sala suya', async () => {
    const { matchmaker } = setUp();
    const daily = ticketOf(await matchmaker.search('a', DAILY));
    expect(ticketOf(await matchmaker.search('b', LIVE)).matched).toBe(false);
    const again = ticketOf(await matchmaker.search('a', { pace: 'daily', avoid: [daily.code] }));
    expect(again).toMatchObject({ matched: false });
    expect(again.code).not.toBe(daily.code);
    // Otro que busca se queda la mas vieja.
    expect(ticketOf(await matchmaker.search('c', DAILY))).toMatchObject({ code: daily.code, matched: true });
  });

  it('en vivo solo se empareja con quien esta en su sala; si se ha ido, se le guarda un rato y despues sale de la cola', async () => {
    const { clock, rooms, matchmaker } = setUp();
    const opener = ticketOf(await matchmaker.search('a', LIVE));
    // Sin quien la abrio dentro no se la dan a nadie: el siguiente abre la suya.
    const reloading = ticketOf(await matchmaker.search('b', LIVE));
    expect(reloading.matched).toBe(false);
    await rooms.enter(opener.code, opener.token);
    expect(ticketOf(await matchmaker.search('c', LIVE))).toMatchObject({ code: opener.code, matched: true });
    // Quien abrio la segunda no esta (se ve ahora); si vuelve antes de que pase la gracia, sigue en la cola.
    const gone = ticketOf(await matchmaker.search('d', LIVE));
    await rooms.enter(reloading.code, reloading.token);
    expect(ticketOf(await matchmaker.search('e', LIVE))).toMatchObject({ code: reloading.code, matched: true });
    // Quien abrio la tercera no vuelve: pasada la gracia sale de la cola, y aunque vuelva ya no se la dan a nadie.
    expect(ticketOf(await matchmaker.search('f', LIVE)).matched).toBe(false);
    clock.now += LIVE_ABSENCE_GRACE_MS + 1;
    expect(ticketOf(await matchmaker.search('g', LIVE)).matched).toBe(false);
    await rooms.enter(gone.code, gone.token);
    expect(ticketOf(await matchmaker.search('h', LIVE)).code).not.toBe(gone.code);
  });

  it('una sala cerrada (o que ya no espera) sale de la cola', async () => {
    const { rooms, matchmaker } = setUp();
    const closed = ticketOf(await matchmaker.search('a', DAILY));
    expect(await rooms.close(closed.code, closed.token)).toEqual({ ok: true });
    const next = ticketOf(await matchmaker.search('b', DAILY));
    expect(next.matched).toBe(false);
    expect(next.code).not.toBe(closed.code);
    // La otra se la da su creador a la IA: ya no espera.
    expect(await rooms.handToAi(next.code, next.token, 1)).toEqual({ ok: true });
    expect(ticketOf(await matchmaker.search('c', DAILY)).matched).toBe(false);
  });

  it('dos busquedas a la vez van de una en una: se encuentran', async () => {
    const { matchmaker } = setUp();
    const [first, second] = (await Promise.all([matchmaker.search('a', DAILY), matchmaker.search('b', DAILY)])).map(ticketOf);
    expect(first?.matched).toBe(false);
    expect(second).toMatchObject({ code: first?.code, matched: true });
  });

  it('si una busqueda falla a medias, la cola no se queda cambiada: la siguiente parte de la guardada', async () => {
    const { rooms, matchmaker } = setUp();
    const opener = ticketOf(await matchmaker.search('a', DAILY));
    rooms.failClaims = true;
    await expect(matchmaker.search('b', DAILY)).rejects.toThrow();
    rooms.failClaims = false;
    expect(ticketOf(await matchmaker.search('c', DAILY))).toMatchObject({ code: opener.code, matched: true });
  });

  it('la cola se guarda: otro emparejador con el mismo almacen la sigue', async () => {
    const { clock, rooms, store, matchmaker } = setUp();
    const opener = ticketOf(await matchmaker.search('a', DAILY));
    const restarted = new Matchmaker(rooms, store, () => clock.now);
    expect(ticketOf(await restarted.search('b', DAILY))).toMatchObject({ code: opener.code, matched: true });
    // Lo que no es una cola no rompe nada: se empieza con la cola vacia.
    store.text = JSON.stringify({ daily: [{ code: 'mal' }, 7], live: 'nada' });
    expect(ticketOf(await new Matchmaker(rooms, store, () => clock.now).search('c', DAILY)).matched).toBe(false);
  });

  it('a la misma direccion no se le atienden mas de las busquedas del tope en la ventana; a otra, si', async () => {
    const { clock, matchmaker } = setUp();
    for (let search = 0; search < MAX_SEARCHES_PER_WINDOW; search++) expect((await matchmaker.search('a', DAILY)).ok).toBe(true);
    expect(await matchmaker.search('a', DAILY)).toEqual({ ok: false, error: 'tooManySearches' });
    expect((await matchmaker.search('b', DAILY)).ok).toBe(true);
    clock.now += SEARCH_WINDOW_MS;
    expect((await matchmaker.search('a', DAILY)).ok).toBe(true);
  });

  it('la sala de cada ritmo trae el reloj de turno del ritmo', async () => {
    const { clock, rooms, matchmaker } = setUp();
    const live = ticketOf(await matchmaker.search('a', LIVE));
    await rooms.enter(live.code, live.token);
    ticketOf(await matchmaker.search('b', LIVE));
    const info = await rooms.info(live.code);
    expect(info?.turn?.endsAt).toBe(clock.now + PACE_RULES.live.turnSeconds * MS_PER_SECOND);
  });
});

describe('lo que pide quien busca', () => {
  it('el ritmo, y si quiere sus salas (como mucho unas pocas, con codigos bien escritos)', () => {
    expect(searchRequestOf({ pace: 'daily' })).toEqual({ pace: 'daily', avoid: [] });
    expect(searchRequestOf({ pace: 'live', avoid: ['ABCDEF'] })).toEqual({ pace: 'live', avoid: ['ABCDEF'] });
    expect(searchRequestOf({ pace: 'weekly' })).toBeNull();
    expect(searchRequestOf({ pace: 'daily', avoid: ['abc'] })).toBeNull();
    expect(searchRequestOf({ pace: 'daily', avoid: Array.from({ length: MAX_AVOIDED_ROOMS + 1 }, () => 'ABCDEF') })).toBeNull();
    expect(searchRequestOf({ pace: 'daily', rules: {} })).toBeNull();
    expect(searchRequestOf('daily')).toBeNull();
  });
});
