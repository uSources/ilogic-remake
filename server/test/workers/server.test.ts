/**
 * El servidor en Cloudflare, de verdad (el Worker y sus Durable Objects dentro de workerd): las
 * pruebas comunes (serverSuite.ts) y lo que solo pasa aqui, despertar un objeto que se durmio con las
 * conexiones abiertas y sus alarmas (se adelanta un reloj en el almacen y se hace sonar).
 */
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { RoomObject } from '../../src/cloudflare/roomObject';
import { CLOSE_CODES } from '../../src/hostedRoom';
import type { RoomMeta, StoredRoom } from '../../src/roomHost';
import { createRoom, describeServer, joinedRoom, lobbyOf } from '../shared/serverSuite';
import { SocketClient } from '../shared/socketClient';
import type { TestServer } from '../shared/testServer';

const BASE = 'https://servidor';

const stubOf = (code: string): DurableObjectStub<RoomObject> => env.ROOMS.get(env.ROOMS.idFromName(code));

/** La conexion de una sala, abierta por el Worker (la subida a WebSocket de workerd, sin red). */
async function openSocket(code: string, origin: string): Promise<WebSocket> {
  const response = await exports.default.fetch(`${BASE}/rooms/${code}/ws`, { headers: { Upgrade: 'websocket', Origin: origin } });
  if (!response.webSocket) throw new Error(`Sin WebSocket: ${response.status} ${await response.text()}`);
  response.webSocket.accept();
  return response.webSocket;
}

/** Lo que el objeto tiene guardado (para mirar que guarda, y para adelantar sus relojes). */
const storedOf = (code: string): Promise<StoredRoom | null> =>
  runInDurableObject(stubOf(code), async (_instance, state) => {
    const stored = await state.storage.get<unknown>(['room', 'meta']);
    const meta = stored.get('meta') as RoomMeta | undefined;
    return meta ? { snapshot: stored.get('room'), meta } : null;
  });

const cloudflare: TestServer = {
  fetch: (path, init) => exports.default.fetch(`${BASE}${path}`, init),
  openSocket,
  stored: storedOf,
};

describeServer(() => cloudflare);

/**
 * Adelanta un reloj: se cambia lo guardado y se echa al objeto de memoria (como si hubiera
 * hibernado: sus conexiones siguen), para que al sonar la alarma lea los relojes del almacen.
 */
async function advanceTimer(code: string, change: (timers: RoomMeta['timers']) => void): Promise<void> {
  await runInDurableObject(stubOf(code), async (_instance, state) => {
    const meta = (await state.storage.get<RoomMeta>('meta'))!;
    change(meta.timers);
    await state.storage.put('meta', meta);
    await state.storage.setAlarm(Date.now());
  });
  await evictDurableObject(stubOf(code));
  expect(await runDurableObjectAlarm(stubOf(code))).toBe(true);
}

describe('el Durable Object', () => {
  it('al despertar el objeto, las conexiones que siguen vuelven a entrar solas y la partida sigue', async () => {
    const { code, clients } = await joinedRoom(cloudflare);
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
    expect((await storedOf(code))?.meta.timers.continueAt).toBeNull();
  });
});

describe('las alarmas', () => {
  it('una sala sin actividad caduca: se borra y las conexiones se cierran', async () => {
    const { code, clients } = await joinedRoom(cloudflare);
    await advanceTimer(code, (timers) => (timers.expiresAt = Date.now() - 1));
    for (const client of clients) expect(await client.closed).toMatchObject({ code: CLOSE_CODES.gone });
    expect((await lobbyOf(cloudflare, code)).status).toBe(404);
    expect(await storedOf(code)).toBeNull();
  });

  it('con reloj de turno, al vencer el turno pasa al siguiente', async () => {
    const { code, clients } = await joinedRoom(cloudflare, { turnSeconds: 60 });
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const first = clients.find((client) => client.net.isMyTurn)!;
    const other = clients.find((client) => client !== first)!;
    const stored = await storedOf(code);
    expect(stored?.meta.timers.turn).toMatchObject({ seat: first.net.seat });
    expect(stored!.meta.timers.turn!.at).toBeGreaterThan(Date.now() + 50_000);
    await advanceTimer(code, (timers) => (timers.turn!.at = Date.now() - 1));
    // Al despertar, los dos vuelven a entrar (saludo, vista, turno de antes); despues, el turno nuevo.
    for (const client of clients) await client.take(['turn']);
    for (const client of clients) await client.take(['turn']);
    expect(other.net.isMyTurn).toBe(true);
    expect((await storedOf(code))?.meta.timers.turn).toMatchObject({ seat: other.net.seat });
  });

  it('si el creador lo pidio, los que no llegan a tiempo pasan a la IA y la partida empieza', async () => {
    const created = await createRoom(cloudflare, { waitingSeconds: 60 });
    const client = await SocketClient.join(cloudflare, created.code, created.token);
    expect((await storedOf(created.code))?.meta.timers.waitingUntil).toBeGreaterThan(Date.now());
    await advanceTimer(created.code, (timers) => (timers.waitingUntil = Date.now() - 1));
    const lobby = (await lobbyOf(cloudflare, created.code)).info!;
    expect(lobby.status).toBe('playing');
    expect(lobby.seats.map((seat) => seat.kind)).toEqual(['person', 'ai', 'ai']);
    expect((await storedOf(created.code))?.meta.timers.waitingUntil).toBeNull();
    await client.take(['turn']);
    expect(client.net.isMyTurn).toBe(true);
  });
});
