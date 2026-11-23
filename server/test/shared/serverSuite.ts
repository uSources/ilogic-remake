/**
 * Lo que tiene que hacer cualquier servidor de partidas, lo aloje quien lo aloje: las rutas, una
 * partida entera por WebSocket (dos personas y la IA), volver a entrar y lo que no deja pasar. Lo
 * corren test/workers (Cloudflare) y node/test (Node) con su `TestServer`; lo que solo pasa en uno
 * (despertar un Durable Object, arrancar Node otra vez) esta en el suyo.
 */
import { describe, expect, it } from 'vitest';
import { CURRENT_PROTOCOL, isRoomCode, type SeatId } from '@core/net';
import { CLOSE_CODES } from '../../src/hostedRoom';
import { MAX_MESSAGE_BYTES } from '../../src/limits';
import type { LobbyInfo } from '../../src/roomAdapter';
import type { StoredRoom } from '../../src/roomHost';
import type { RoomRequest } from '../../src/roomRequest';
import { closingOf, play, SocketClient } from './socketClient';
import { GAME_ORIGIN, type TestServer } from './testServer';

/** Dos personas y la IA, en un mapa pequeño con niebla (semilla fija: la partida es siempre la misma). */
export const roomRequest = (changes: Partial<RoomRequest> = {}): RoomRequest => ({
  match: {
    seed: 21,
    size: 20,
    settingChanges: { fog: true },
    teams: [{ controller: 'human' }, { controller: 'human' }, { controller: 'ai' }],
  },
  ...changes,
});

/** Lo que contesta el servidor a quien se queda con un asiento (al crear la sala, o con el codigo). */
export interface SeatTicket {
  code: string;
  seat: SeatId;
  team: number;
  token: string;
}

/** Lo que dice la sala guardada de si misma (lo demas de la partida no hace falta aqui). */
export const storedStatus = (stored: StoredRoom | null): string | undefined =>
  (stored?.snapshot as { status?: string } | undefined)?.status;

export function post(server: TestServer, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return server.fetch('/rooms', {
    method: 'POST',
    body: text,
    headers: { Origin: GAME_ORIGIN, 'Content-Type': 'application/json', ...headers },
  });
}

/** El cuerpo JSON de una respuesta (en workerd \`json\` lleva el tipo; en Node, no: aqui igual en los dos). */
export async function bodyOf<Body>(response: Response): Promise<Body> {
  const body: unknown = await response.json();
  return body as Body;
}

export async function createRoom(server: TestServer, changes: Partial<RoomRequest> = {}): Promise<SeatTicket> {
  const response = await post(server, roomRequest(changes));
  expect(response.status).toBe(201);
  return bodyOf<SeatTicket>(response);
}

/** Pide un asiento con el codigo de la sala (lo que hace quien abre el enlace de la sala). */
export function claimSeat(server: TestServer, code: string): Promise<Response> {
  return server.fetch(`/rooms/${code}/seat`, { method: 'POST', headers: { Origin: GAME_ORIGIN } });
}

export async function lobbyOf(server: TestServer, code: string): Promise<{ status: number; info: LobbyInfo | null }> {
  const response = await server.fetch(`/rooms/${code}`, { headers: { Origin: GAME_ORIGIN } });
  return { status: response.status, info: response.ok ? await bodyOf<LobbyInfo>(response) : null };
}

/** Las dos personas dentro de una sala nueva (la partida ya ha empezado): quien la crea y quien llega con el codigo. */
export async function joinedRoom(
  server: TestServer,
  changes: Partial<RoomRequest> = {},
): Promise<{ code: string; clients: SocketClient[]; tokens: string[] }> {
  const created = await createRoom(server, changes);
  const guest = await bodyOf<SeatTicket>(await claimSeat(server, created.code));
  const tokens = [created.token, guest.token];
  const clients: SocketClient[] = [];
  for (const token of tokens) clients.push(await SocketClient.join(server, created.code, token));
  return { code: created.code, clients, tokens };
}

/** Las pruebas comunes, contra el servidor que da `serverOf` (se pide en cada prueba: puede arrancar antes). */
export function describeServer(serverOf: () => TestServer): void {
  describeRoutes(serverOf);
  describeMatch(serverOf);
  describeRefusals(serverOf);
}

function describeRoutes(serverOf: () => TestServer): void {
  describe('las rutas del servidor', () => {
    it('crea una sala: un codigo de 6 letras y el primer asiento, con su ficha; el vestibulo no cuenta las fichas', async () => {
      const created = await createRoom(serverOf());
      expect(isRoomCode(created.code)).toBe(true);
      expect(created).toMatchObject({ seat: 0, team: 0 });
      expect(created.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      const lobby = await lobbyOf(serverOf(), created.code);
      expect(lobby.status).toBe(200);
      expect(lobby.info).toEqual({
        status: 'waiting',
        ...CURRENT_PROTOCOL,
        seats: [
          { seat: 0, team: 0, kind: 'person', joined: false },
          { seat: 1, team: 1, kind: 'person', joined: false },
          { seat: 2, team: 2, kind: 'ai', joined: false },
        ],
        turn: null,
      });
      expect(JSON.stringify(lobby.info)).not.toContain(created.token);
    });

    it('con el codigo se pide el siguiente asiento libre, una vez cada uno; luego, ninguno', async () => {
      const server = serverOf();
      const created = await createRoom(server);
      const first = await claimSeat(server, created.code);
      expect(first.status).toBe(200);
      const guest = await bodyOf<SeatTicket>(first);
      expect(guest).toMatchObject({ code: created.code, seat: 1, team: 1 });
      expect(guest.token).not.toBe(created.token);
      const full = await claimSeat(server, created.code);
      expect(full.status).toBe(409);
      expect(await bodyOf(full)).toEqual({ error: 'noFreeSeat' });
      expect((await claimSeat(server, 'ABCDEF')).status).toBe(404);
    });

    it('una sala que no existe, un codigo mal escrito y una ruta que no hay', async () => {
      const server = serverOf();
      expect((await lobbyOf(server, 'ABCDEF')).status).toBe(404);
      expect((await lobbyOf(server, 'abcdef')).status).toBe(400);
      expect((await server.fetch('/otra', { headers: { Origin: GAME_ORIGIN } })).status).toBe(404);
      const noUpgrade = await server.fetch('/rooms/ABCDEF/ws', { headers: { Origin: GAME_ORIGIN } });
      expect(noUpgrade.status).toBe(400);
    });

    it('lo que no es una sala bien pedida se rechaza, y lo que pesa de mas tambien', async () => {
      const server = serverOf();
      expect((await post(server, '{no es json')).status).toBe(400);
      expect((await post(server, { match: { seed: 1, teams: [{ controller: 'ai' }, { controller: 'ai' }] } })).status).toBe(400);
      expect((await post(server, JSON.stringify({ padding: 'x'.repeat(MAX_MESSAGE_BYTES) }))).status).toBe(413);
    });

    it('CORS: la web del juego, localhost y file:// (null) pueden; otra web, no', async () => {
      const server = serverOf();
      const preflight = await server.fetch('/rooms', { method: 'OPTIONS', headers: { Origin: GAME_ORIGIN } });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe(GAME_ORIGIN);
      expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      for (const origin of ['http://localhost:5173', 'http://127.0.0.1:8080', 'null']) {
        const response = await server.fetch('/rooms/ABCDEF', { headers: { Origin: origin } });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      }
      const other = await server.fetch('/rooms/ABCDEF', { headers: { Origin: 'https://otra.example' } });
      expect(other.status).toBe(403);
      expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });
}

function describeMatch(serverOf: () => TestServer): void {
  describe('una partida por WebSocket', () => {
    it('dos personas y la IA juegan varios dias; cada paso queda guardado y el vestibulo dice quien esta', async () => {
      const server = serverOf();
      const { code, clients } = await joinedRoom(server);
      expect((await lobbyOf(server, code)).info?.status).toBe('playing');
      expect((await lobbyOf(server, code)).info?.seats.map((seat) => seat.joined)).toEqual([true, true, false]);
      // De quien es el turno lo sabe cualquiera (la partida lo anuncia a todos); sin reloj, no acaba nunca.
      expect((await lobbyOf(server, code)).info?.turn).toEqual({ seat: 0, day: 1, endsAt: null });
      const busy = await claimSeat(server, code);
      expect(busy.status).toBe(409);
      expect(await bodyOf(busy)).toEqual({ error: 'notWaiting' });
      await play(clients, () => clients.every((client) => (client.net.state?.day ?? 0) >= 3));
      for (const client of clients) {
        expect(client.net.state?.day).toBeGreaterThanOrEqual(3);
        expect(client.received('error')).toBe(0);
        expect(client.received('events')).toBeGreaterThan(2);
      }
      const stored = await server.stored(code);
      expect(storedStatus(stored)).toBe('playing');
      expect(stored?.meta.timers.turn).toBeNull();
      expect(stored?.meta.timers.expiresAt).toBeGreaterThan(Date.now());
    });

    it('un mensaje repetido (el mismo numero de orden) no se hace dos veces', async () => {
      const { clients } = await joinedRoom(serverOf());
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

    it('con la misma ficha se vuelve a entrar desde otra conexion, y la de antes se cierra', async () => {
      const server = serverOf();
      const { code, clients, tokens } = await joinedRoom(server);
      await Promise.all(clients.map((client) => client.take(['turn'])));
      const again = await SocketClient.join(server, code, tokens[0]!);
      expect(await clients[0]!.closed).toMatchObject({ code: CLOSE_CODES.replaced });
      expect((await again.take(['turn'])).kind).toBe('turn');
      expect(again.net.isMyTurn).toBe(true);
      // Irse del todo: el vestibulo lo sabe.
      again.close();
      await again.closed;
      await expect.poll(async () => (await lobbyOf(server, code)).info?.seats[0]?.joined).toBe(false);
    });
  });
}

function describeRefusals(serverOf: () => TestServer): void {
  describe('lo que la sala no deja pasar', () => {
    it('una ficha que no es de la sala, otra version y lo que no es un saludo se despiden con su codigo', async () => {
      const server = serverOf();
      const { code } = await createRoom(server);
      const badToken = await server.openSocket(code, GAME_ORIGIN);
      badToken.send(JSON.stringify({ kind: 'hello', token: 'inventada', ...CURRENT_PROTOCOL }));
      expect(await closingOf(badToken)).toMatchObject({ code: CLOSE_CODES.badToken });
      const badVersion = await server.openSocket(code, GAME_ORIGIN);
      badVersion.send(JSON.stringify({ kind: 'hello', token: 'x', protocol: CURRENT_PROTOCOL.protocol + 1, save: CURRENT_PROTOCOL.save }));
      expect(await closingOf(badVersion)).toMatchObject({ code: CLOSE_CODES.badVersion });
      const notHello = await server.openSocket(code, GAME_ORIGIN);
      notHello.send(JSON.stringify({ kind: 'resync' }));
      expect(await closingOf(notHello)).toMatchObject({ code: CLOSE_CODES.badMessage });
      const notJson = await server.openSocket(code, GAME_ORIGIN);
      notJson.send('hola');
      expect(await closingOf(notJson)).toMatchObject({ code: CLOSE_CODES.badMessage });
    });

    it('un mensaje que pesa de mas cierra la conexion sin leerlo', async () => {
      const server = serverOf();
      const { code } = await createRoom(server);
      const socket = await server.openSocket(code, GAME_ORIGIN);
      socket.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
      expect(await closingOf(socket)).toMatchObject({ code: CLOSE_CODES.tooBig });
    });

    it('a quien insiste con mensajes que la sala rechaza se le corta', async () => {
      const { clients } = await joinedRoom(serverOf());
      await Promise.all(clients.map((client) => client.take(['turn'])));
      const other = clients.find((client) => !client.net.isMyTurn)!;
      for (let i = 0; i < 40; i++) other.send({ kind: 'endTurn', seq: 1 });
      expect(await other.closed).toMatchObject({ code: CLOSE_CODES.tooManyRejections });
    });
  });
}
