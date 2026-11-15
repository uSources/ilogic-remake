import { env, evictDurableObject, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { CURRENT_PROTOCOL, type SeatId } from '@core/net';
import { isRoomCode } from '../../src/codes';
import { MAX_MESSAGE_BYTES } from '../../src/limits';
import type { LobbyInfo } from '../../src/roomAdapter';
import { CLOSE_CODES, type RoomObject } from '../../src/roomObject';
import type { RoomRequest } from '../../src/roomRequest';
import { closingOf, openSocket, play, SocketClient } from './socketClient';

const ORIGIN = 'https://usources.github.io';
const BASE = 'https://servidor';

/** Dos personas y la IA, en un mapa pequeño con niebla (semilla fija: la partida es siempre la misma). */
const request = (changes: Partial<RoomRequest> = {}): RoomRequest => ({
  match: {
    seed: 21,
    size: 20,
    settingChanges: { fog: true },
    teams: [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }],
  },
  ...changes,
});

interface Created {
  code: string;
  seats: { seat: SeatId; team: number; token: string; invite: string }[];
}

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return SELF.fetch(`${BASE}/rooms`, {
    method: 'POST',
    body: text,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
  });
}

async function createRoom(changes: Partial<RoomRequest> = {}): Promise<Created> {
  const response = await post(request(changes));
  expect(response.status).toBe(201);
  return response.json<Created>();
}

const lobbyOf = async (code: string): Promise<{ status: number; info: LobbyInfo | null }> => {
  const response = await SELF.fetch(`${BASE}/rooms/${code}`, { headers: { Origin: ORIGIN } });
  return { status: response.status, info: response.ok ? await response.json<LobbyInfo>() : null };
};

const stubOf = (code: string): DurableObjectStub<RoomObject> => env.ROOMS.get(env.ROOMS.idFromName(code));

/** Lo que el objeto tiene guardado (para mirar que guarda, y para adelantar sus relojes). */
interface Stored {
  room: { status: string; seats: { kind: string }[] } | undefined;
  meta:
    | { timers: { expiresAt: number; turn: { seat: SeatId; at: number } | null; waitingUntil: number | null; continueAt: number | null } }
    | undefined;
}

const storedOf = (code: string): Promise<Stored> =>
  runInDurableObject(stubOf(code), async (_instance, state) => {
    const stored = await state.storage.get<unknown>(['room', 'meta']);
    return { room: stored.get('room'), meta: stored.get('meta') } as Stored;
  });

/**
 * Adelanta un reloj: se cambia lo guardado y se echa al objeto de memoria (como si hubiera
 * hibernado: sus conexiones siguen), para que al sonar la alarma lea los relojes del almacen.
 */
async function advanceTimer(code: string, change: (timers: NonNullable<Stored['meta']>['timers']) => void): Promise<void> {
  await runInDurableObject(stubOf(code), async (_instance, state) => {
    const meta = (await state.storage.get<NonNullable<Stored['meta']>>('meta'))!;
    change(meta.timers);
    await state.storage.put('meta', meta);
    await state.storage.setAlarm(Date.now());
  });
  await evictDurableObject(stubOf(code));
  expect(await runDurableObjectAlarm(stubOf(code))).toBe(true);
}

/** Las dos personas dentro de una sala nueva (la partida ya ha empezado). */
async function joinedRoom(changes: Partial<RoomRequest> = {}): Promise<{ code: string; clients: SocketClient[]; created: Created }> {
  const created = await createRoom(changes);
  const clients: SocketClient[] = [];
  for (const seat of created.seats) clients.push(await SocketClient.join(created.code, seat.token));
  return { code: created.code, clients, created };
}

describe('las rutas del servidor', () => {
  it('crea una sala: un codigo de 6 letras y, por persona, su ficha y su enlace; el vestibulo no cuenta las fichas', async () => {
    const created = await createRoom();
    expect(isRoomCode(created.code)).toBe(true);
    expect(created.seats.map((seat) => [seat.seat, seat.team])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    for (const seat of created.seats) {
      expect(seat.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(seat.invite).toBe(`#/sala/${created.code}/${seat.token}`);
    }
    const lobby = await lobbyOf(created.code);
    expect(lobby.status).toBe(200);
    expect(lobby.info).toEqual({
      status: 'waiting',
      ...CURRENT_PROTOCOL,
      seats: [
        { seat: 0, team: 0, kind: 'person', joined: false },
        { seat: 1, team: 1, kind: 'person', joined: false },
        { seat: 2, team: 2, kind: 'ai', joined: false },
      ],
    });
    expect(JSON.stringify(lobby.info)).not.toContain(created.seats[0]!.token);
  });

  it('una sala que no existe, un codigo mal escrito y una ruta que no hay', async () => {
    expect((await lobbyOf('ABCDEF')).status).toBe(404);
    expect((await lobbyOf('abcdef')).status).toBe(400);
    expect((await SELF.fetch(`${BASE}/otra`, { headers: { Origin: ORIGIN } })).status).toBe(404);
    const noUpgrade = await SELF.fetch(`${BASE}/rooms/ABCDEF/ws`, { headers: { Origin: ORIGIN } });
    expect(noUpgrade.status).toBe(400);
  });

  it('lo que no es una sala bien pedida se rechaza, y lo que pesa de mas tambien', async () => {
    expect((await post('{no es json')).status).toBe(400);
    expect((await post({ match: { seed: 1, teams: [{ controller: 'ai' }, { controller: 'ai' }] } })).status).toBe(400);
    expect((await post(JSON.stringify({ padding: 'x'.repeat(MAX_MESSAGE_BYTES) }))).status).toBe(413);
  });

  it('CORS: la web del juego, localhost y file:// (null) pueden; otra web, no', async () => {
    const preflight = await SELF.fetch(`${BASE}/rooms`, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:8080', 'null']) {
      const response = await SELF.fetch(`${BASE}/rooms/ABCDEF`, { headers: { Origin: origin } });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    }
    const other = await SELF.fetch(`${BASE}/rooms/ABCDEF`, { headers: { Origin: 'https://otra.example' } });
    expect(other.status).toBe(403);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('una partida por el Durable Object', () => {
  it('dos personas y la IA juegan varios dias; cada paso queda guardado y el vestibulo dice quien esta', async () => {
    const { code, clients } = await joinedRoom();
    expect((await lobbyOf(code)).info?.status).toBe('playing');
    expect((await lobbyOf(code)).info?.seats.map((seat) => seat.joined)).toEqual([true, true, false]);
    await play(clients, () => clients.every((client) => (client.net.state?.day ?? 0) >= 3));
    for (const client of clients) {
      expect(client.net.state?.day).toBeGreaterThanOrEqual(3);
      expect(client.received('error')).toBe(0);
      expect(client.received('events')).toBeGreaterThan(2);
    }
    const stored = await storedOf(code);
    expect(stored.room?.status).toBe('playing');
    expect(stored.meta?.timers.turn).toBeNull();
    expect(stored.meta?.timers.expiresAt).toBeGreaterThan(Date.now());
  });

  it('un mensaje repetido (el mismo numero de orden) no se hace dos veces', async () => {
    const { clients } = await joinedRoom();
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const first = clients.find((client) => client.net.isMyTurn)!;
    const endTurn = first.net.ordered({ kind: 'endTurn' });
    first.send(endTurn);
    first.send(endTurn);
    const repeated = await first.take(['error']);
    expect(repeated).toEqual({ kind: 'error', error: 'stale', seq: endTurn.seq });
    // El turno paso una sola vez: ahora le toca a la otra persona, no otra vez a la primera.
    const other = clients.find((client) => client !== first)!;
    await other.take(['turn']);
    expect(other.net.isMyTurn).toBe(true);
  });

  it('al despertar el objeto, las conexiones que siguen vuelven a entrar solas y la partida sigue', async () => {
    const { code, clients } = await joinedRoom();
    await Promise.all(clients.map((client) => client.take(['turn'])));
    await evictDurableObject(stubOf(code));
    const first = clients.find((client) => client.net.isMyTurn)!;
    const other = clients.find((client) => client !== first)!;
    first.send({ kind: 'resync' });
    // Al despertar, los dos vuelven a entrar (saludo, vista y el turno de antes); el primero recibe ademas la vista que pidio.
    for (const client of clients) {
      expect((await client.take(['welcome'])).kind).toBe('welcome');
      await client.take(['view']);
      await client.take(['turn']);
    }
    await first.take(['view']);
    expect(first.net.isMyTurn).toBe(true);
    await first.playTurn();
    await Promise.all(clients.map((client) => client.take(['turn'])));
    expect(other.net.isMyTurn).toBe(true);
    expect((await storedOf(code)).meta?.timers.continueAt).toBeNull();
  });

  it('con la misma ficha se vuelve a entrar desde otra conexion, y la de antes se cierra', async () => {
    const { code, clients, created } = await joinedRoom();
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const again = await SocketClient.join(code, created.seats[0]!.token);
    expect(await clients[0]!.closed).toMatchObject({ code: CLOSE_CODES.replaced });
    expect((await again.take(['turn'])).kind).toBe('turn');
    expect(again.net.isMyTurn).toBe(true);
    // Irse del todo: el vestibulo lo sabe.
    again.close();
    await again.closed;
    await expect.poll(async () => (await lobbyOf(code)).info?.seats[0]?.joined).toBe(false);
  });
});

describe('lo que el objeto no deja pasar', () => {
  it('una ficha que no es de la sala, otra version y lo que no es un saludo se despiden con su codigo', async () => {
    const { code } = await createRoom();
    const badToken = await openSocket(code);
    badToken.send(JSON.stringify({ kind: 'hello', token: 'inventada', ...CURRENT_PROTOCOL }));
    expect(await closingOf(badToken)).toMatchObject({ code: CLOSE_CODES.badToken });
    const badVersion = await openSocket(code);
    badVersion.send(JSON.stringify({ kind: 'hello', token: 'x', protocol: CURRENT_PROTOCOL.protocol + 1, save: CURRENT_PROTOCOL.save }));
    expect(await closingOf(badVersion)).toMatchObject({ code: CLOSE_CODES.badVersion });
    const notHello = await openSocket(code);
    notHello.send(JSON.stringify({ kind: 'resync' }));
    expect(await closingOf(notHello)).toMatchObject({ code: CLOSE_CODES.badMessage });
    const notJson = await openSocket(code);
    notJson.send('hola');
    expect(await closingOf(notJson)).toMatchObject({ code: CLOSE_CODES.badMessage });
  });

  it('un mensaje que pesa de mas cierra la conexion sin leerlo', async () => {
    const { code } = await createRoom();
    const socket = await openSocket(code);
    socket.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(await closingOf(socket)).toMatchObject({ code: CLOSE_CODES.tooBig });
  });

  it('a quien insiste con mensajes que la sala rechaza se le corta', async () => {
    const { clients } = await joinedRoom();
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const other = clients.find((client) => !client.net.isMyTurn)!;
    for (let i = 0; i < 40; i++) other.send({ kind: 'endTurn', seq: 1 });
    expect(await other.closed).toMatchObject({ code: CLOSE_CODES.tooManyRejections });
  });
});

describe('las alarmas', () => {
  it('una sala sin actividad caduca: se borra y las conexiones se cierran', async () => {
    const { code, clients } = await joinedRoom();
    await advanceTimer(code, (timers) => (timers.expiresAt = Date.now() - 1));
    for (const client of clients) expect(await client.closed).toMatchObject({ code: CLOSE_CODES.gone });
    expect((await lobbyOf(code)).status).toBe(404);
    expect((await storedOf(code)).room).toBeUndefined();
  });

  it('con reloj de turno, al vencer el turno pasa al siguiente', async () => {
    const { code, clients } = await joinedRoom({ turnSeconds: 60 });
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const first = clients.find((client) => client.net.isMyTurn)!;
    const other = clients.find((client) => client !== first)!;
    const stored = await storedOf(code);
    expect(stored.meta?.timers.turn).toMatchObject({ seat: first.net.seat });
    expect(stored.meta!.timers.turn!.at).toBeGreaterThan(Date.now() + 50_000);
    await advanceTimer(code, (timers) => (timers.turn!.at = Date.now() - 1));
    // Al despertar, los dos vuelven a entrar (saludo, vista, turno de antes); despues, el turno nuevo.
    for (const client of clients) await client.take(['turn']);
    for (const client of clients) await client.take(['turn']);
    expect(other.net.isMyTurn).toBe(true);
    expect((await storedOf(code)).meta?.timers.turn).toMatchObject({ seat: other.net.seat });
  });

  it('si el creador lo pidio, los que no llegan a tiempo pasan a la IA y la partida empieza', async () => {
    const created = await createRoom({ waitingSeconds: 60 });
    const client = await SocketClient.join(created.code, created.seats[0]!.token);
    expect((await storedOf(created.code)).meta?.timers.waitingUntil).toBeGreaterThan(Date.now());
    await advanceTimer(created.code, (timers) => (timers.waitingUntil = Date.now() - 1));
    const lobby = (await lobbyOf(created.code)).info!;
    expect(lobby.status).toBe('playing');
    expect(lobby.seats.map((seat) => seat.kind)).toEqual(['person', 'ai', 'ai']);
    expect((await storedOf(created.code)).meta?.timers.waitingUntil).toBeNull();
    await client.take(['turn']);
    expect(client.net.isMyTurn).toBe(true);
  });
});
