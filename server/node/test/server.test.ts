/**
 * El servidor en Node, de verdad (en un puerto, con sus ficheros): las pruebas comunes
 * (test/shared/serverSuite.ts, las mismas que pasa Cloudflare) y lo que solo pasa aqui: las alarmas
 * con `setTimeout` (con la hora adelantada a mano), arrancar otra vez con las salas guardadas y
 * servir el juego en la misma direccion.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { newRoomCode } from '../../src/codes';
import { CLOSE_CODES } from '../../src/hostedRoom';
import { MAX_MESSAGE_BYTES, MAX_SEARCHES_PER_WINDOW, ROOM_EXPIRY_MS } from '../../src/limits';
import { CLIENT_ADDRESS_HEADER } from '../../src/routes';
import { bodyOf, createRoom, describeServer, joinedRoom, lobbyOf, post, roomRequest, searchTicket } from '../../test/shared/serverSuite';
import { closingOf, SocketClient } from '../../test/shared/socketClient';
import { GAME_ORIGIN } from '../../test/shared/testServer';
import { NodeRooms } from '../src/nodeRooms';
import { RoomFiles } from '../src/roomFiles';
import { useNodeServer } from './nodeTestServer';

/** Lo que se cierra al parar el servidor (1001: «se va»). */
const GOING_AWAY = 1001;
/** Lo que cierra `ws` cuando una trama pasa de su tope (1009: «demasiado grande»). */
const MESSAGE_TOO_BIG = 1009;
const SECOND = 1000;
/** Una carpeta donde se puede leer pero no escribir (y la de siempre). */
const READ_ONLY_DIR = 0o500;
const WRITABLE_DIR = 0o700;
/** Root escribe aunque la carpeta no le deje: alli el guardado no se puede hacer fallar asi. */
const IS_ROOT = process.getuid?.() === 0;

describe('las pruebas comunes, en Node', () => {
  const node = useNodeServer();
  describeServer(() => node.server);
});

describe('lo que no tumba el servidor', () => {
  const node = useNodeServer();

  it('una trama mas grande de lo que admite `ws` cierra esa conexion, y el servidor sigue', async () => {
    const { code, clients } = await joinedRoom(node.server);
    const socket = await node.server.openSocket(code, GAME_ORIGIN);
    socket.send('x'.repeat(8 * MAX_MESSAGE_BYTES));
    expect(await closingOf(socket)).toMatchObject({ code: MESSAGE_TOO_BIG });
    expect((await lobbyOf(node.server, code)).info?.status).toBe('playing');
    await Promise.all(clients.map((client) => client.take(['turn'])));
  });
});

describe('el tope de salas', () => {
  const node = useNodeServer({ maxRooms: 1 });

  it('con todas las salas que admite, otra no se crea (serverFull); al caducar una, cabe otra', async () => {
    const { code } = await createRoom(node.server);
    const refused = await post(node.server, roomRequest());
    expect(refused.status).toBe(503);
    expect(await bodyOf(refused)).toEqual({ error: 'serverFull' });
    node.advance(ROOM_EXPIRY_MS + SECOND);
    await node.ring(code);
    await createRoom(node.server);
  });

  it.skipIf(IS_ROOT)('una sala que no se llega a guardar no ocupa sitio', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ilogic-salas-'));
    const rooms = await NodeRooms.open(await RoomFiles.open(dir), 1);
    await chmod(dir, READ_ONLY_DIR);
    await expect(rooms.create(newRoomCode(), roomRequest())).rejects.toThrow();
    await chmod(dir, WRITABLE_DIR);
    expect(await rooms.create(newRoomCode(), roomRequest())).toMatchObject({ ok: true });
    await rooms.shutDown();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('el tope de conexiones', () => {
  const MAX_CONNECTIONS = 3;
  const node = useNodeServer({ maxConnections: MAX_CONNECTIONS });

  /** Una conexion a la sala, o null si el servidor la corta nada mas llegar. */
  const tryOpen = (code: string): Promise<WebSocket | null> => node.server.openSocket(code, GAME_ORIGIN).catch(() => null);

  /** Si una conexion nueva entra (y se cierra enseguida). */
  async function canConnect(code: string): Promise<boolean> {
    const socket = await tryOpen(code);
    socket?.close();
    return socket !== null;
  }

  it('las de mas no entran (sin tumbar nada); al cerrarse las demas, entra otra', async () => {
    const { code } = await createRoom(node.server);
    const opened = await Promise.all(Array.from({ length: MAX_CONNECTIONS + 1 }, () => tryOpen(code)));
    const sockets = opened.filter((socket): socket is WebSocket => socket !== null);
    expect(sockets.length).toBeLessThanOrEqual(MAX_CONNECTIONS);
    expect(sockets.length).toBeGreaterThan(0);
    for (const socket of sockets) socket.close();
    await expect.poll(() => canConnect(code)).toBe(true);
  });
});

describe('las alarmas en Node', () => {
  const node = useNodeServer();

  it('una sala sin actividad caduca: se borra su fichero y las conexiones se cierran', async () => {
    const { code, clients } = await joinedRoom(node.server);
    node.advance(ROOM_EXPIRY_MS + SECOND);
    await node.ring(code);
    for (const client of clients) expect(await client.closed).toMatchObject({ code: CLOSE_CODES.gone });
    expect((await lobbyOf(node.server, code)).status).toBe(404);
    expect(await node.server.stored(code)).toBeNull();
  });

  it('con reloj de turno, al vencer el turno pasa al siguiente', async () => {
    const { code, clients } = await joinedRoom(node.server, { turnSeconds: 60 });
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const first = clients.find((client) => client.net.isMyTurn)!;
    const other = clients.find((client) => client !== first)!;
    const timer = (await node.server.stored(code))?.meta.timers.turn;
    expect(timer).toMatchObject({ seat: first.net.seat });
    // El vestibulo dice cuando se le acaba el turno (lo que enseña «Mis partidas»).
    expect((await lobbyOf(node.server, code)).info?.turn).toEqual({ seat: first.net.seat, day: 1, endsAt: timer?.at });
    node.advance(61 * SECOND);
    await node.ring(code);
    await Promise.all(clients.map((client) => client.take(['turn'])));
    expect(other.net.isMyTurn).toBe(true);
    expect((await node.server.stored(code))?.meta.timers.turn).toMatchObject({ seat: other.net.seat });
  });

  it('si el creador lo pidio, los que no llegan a tiempo pasan a la IA y la partida empieza', async () => {
    const created = await createRoom(node.server, { waitingSeconds: 60 });
    const client = await SocketClient.join(node.server, created.code, created.token);
    node.advance(61 * SECOND);
    await node.ring(created.code);
    const lobby = (await lobbyOf(node.server, created.code)).info!;
    expect(lobby.status).toBe('playing');
    expect(lobby.seats.map((seat) => seat.kind)).toEqual(['person', 'ai', 'ai']);
    await client.take(['turn']);
    expect(client.net.isMyTurn).toBe(true);
  });
});

describe('arrancar otra vez', () => {
  const node = useNodeServer();

  it('las salas guardadas siguen: quien vuelve con su ficha sigue la partida donde estaba', async () => {
    const { code, clients, tokens } = await joinedRoom(node.server);
    await Promise.all(clients.map((client) => client.take(['turn'])));
    const firstSeat = clients.findIndex((client) => client.net.isMyTurn);
    await node.restart();
    for (const client of clients) expect(await client.closed).toMatchObject({ code: GOING_AWAY });
    const back = await Promise.all(tokens.map((token) => SocketClient.join(node.server, code, token)));
    await Promise.all(back.map((client) => client.take(['turn'])));
    const first = back[firstSeat]!;
    expect(first.net.isMyTurn).toBe(true);
    await first.playTurn();
    await Promise.all(back.map((client) => client.take(['turn'])));
    expect(back.find((client) => client !== first)!.net.isMyTurn).toBe(true);
  });

  it('la cola del emparejador sigue: quien busca despues se queda la sala que esperaba', async () => {
    const opener = await searchTicket(node.server, { pace: 'daily' });
    await node.restart();
    expect(await searchTicket(node.server, { pace: 'daily' })).toMatchObject({ code: opener.code, matched: true });
  });

  it('las alarmas se ponen al arrancar: una sala que caduco con el servidor parado se borra sola', async () => {
    const { code } = await createRoom(node.server);
    node.advance(ROOM_EXPIRY_MS + SECOND);
    await node.restart();
    await expect.poll(() => node.server.stored(code)).toBeNull();
    expect((await lobbyOf(node.server, code)).status).toBe(404);
  });
});

describe('el tope de busquedas de rival', () => {
  const node = useNodeServer();

  /** Una busqueda que dice venir de otra direccion (lo que intentaria quien quiere saltarse el tope). */
  const searchFrom = (address: string): Promise<Response> =>
    node.server.fetch('/match', {
      method: 'POST',
      body: JSON.stringify({ pace: 'daily' }),
      headers: { Origin: GAME_ORIGIN, 'Content-Type': 'application/json', [CLIENT_ADDRESS_HEADER]: address },
    });

  it('cuenta por la direccion de la conexion: la cabecera que mande el cliente no vale', async () => {
    for (let search = 0; search < MAX_SEARCHES_PER_WINDOW; search++) expect((await searchFrom(`10.0.0.${search}`)).status).toBe(200);
    const refused = await searchFrom('10.0.1.1');
    expect(refused.status).toBe(429);
    expect(await bodyOf(refused)).toEqual({ error: 'tooManySearches' });
  });
});

/** Un juego compilado de mentira: una pagina y un script. */
function gameFiles(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ilogic-juego-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ilogic</title>');
  writeFileSync(join(dir, 'assets', 'main.js'), 'console.log("hola")');
  return dir;
}

describe('el juego en la misma direccion', () => {
  const node = useNodeServer({ webDir: gameFiles() });

  it('sirve la pagina y sus ficheros con su tipo, y las rutas de las salas siguen siendo las salas', async () => {
    const page = await node.server.fetch('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Type')).toContain('text/html');
    expect(await page.text()).toContain('<title>Ilogic</title>');
    const script = await node.server.fetch('/assets/main.js');
    expect(script.headers.get('Content-Type')).toContain('text/javascript');
    expect((await node.server.fetch('/assets/no-esta.js')).status).toBe(404);
    const lobby = await node.server.fetch('/rooms/ABCDEF', { headers: { Origin: GAME_ORIGIN } });
    expect(lobby.status).toBe(404);
    expect(await lobby.json()).toEqual({ error: 'noSuchRoom' });
  });
});
