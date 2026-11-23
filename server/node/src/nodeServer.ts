/**
 * El servidor de partidas en Node, para alojarlo uno mismo: las mismas rutas que en Cloudflare
 * (routes.ts) por `node:http`, la conexion de cada sala por `ws` y, si se le da la carpeta del juego
 * compilado, tambien el juego (staticFiles.ts), todo en la misma direccion.
 */
import { createServer, STATUS_CODES, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { isOriginAllowed } from '../../src/cors';
import { MAX_MESSAGE_BYTES } from '../../src/limits';
import { Matchmaker } from '../../src/matchmaker';
import { isApiPath, respond, socketRoomCode, type ServerSetup } from '../../src/routes';
import { requestOf, send } from './httpBridge';
import { NodeRooms } from './nodeRooms';
import { RoomFiles } from './roomFiles';
import { serveFile } from './staticFiles';

export interface NodeServerOptions {
  /** 0: el que este libre (en los tests). */
  port: number;
  /** Donde escucha (sin decirlo, en todas las direcciones del equipo). */
  hostname?: string;
  /** La carpeta de las salas guardadas. */
  dataDir: string;
  /** La carpeta del juego compilado, o null para no servirlo (solo las salas). */
  webDir: string | null;
  /** Desde que otras webs se puede hablar con el servidor (cors.ts). */
  allowedOrigins: string;
  /** Cuantas salas puede haber a la vez (las de mas no se crean: `serverFull`). */
  maxRooms: number;
  /** Cuantas conexiones a la vez (peticiones y WebSockets); las de mas, Node las corta nada mas llegar. */
  maxConnections: number;
  /** La hora (en los tests, una que se adelanta a mano). */
  now?: () => number;
}

export interface RunningServer {
  /** Su direccion en este equipo (`http://localhost:PUERTO`). */
  url: string;
  rooms: NodeRooms;
  close(): Promise<void>;
}

/**
 * Lo que pesan como mucho MAX_MESSAGE_BYTES letras en UTF-8 (hasta 4 bytes cada una): `ws` corta
 * antes lo que pasa de ahi, y lo de menos lo mide la sala con su propio codigo de cierre, como en Cloudflare.
 */
const MAX_FRAME_BYTES = 4 * MAX_MESSAGE_BYTES;

const pathOf = (incoming: IncomingMessage): string => new URL(incoming.url ?? '/', 'http://servidor').pathname;

/** Una peticion: el juego si es un fichero suyo; si no, las rutas del servidor de partidas. */
async function answer(incoming: IncomingMessage, outgoing: ServerResponse, setup: ServerSetup, webDir: string | null): Promise<void> {
  const path = pathOf(incoming);
  const isGameFile = webDir !== null && incoming.method === 'GET' && !isApiPath(path);
  if (isGameFile && (await serveFile(webDir, path, outgoing))) return;
  await send(await respond(await requestOf(incoming, MAX_MESSAGE_BYTES), setup), outgoing);
}

/** Algo ha fallado atendiendo una peticion: se apunta y, si aun se puede, se contesta que fue culpa del servidor. */
function failRequest(outgoing: ServerResponse, error: unknown): void {
  console.error('Fallo atendiendo una peticion:', error);
  if (outgoing.headersSent) return void outgoing.destroy();
  outgoing.writeHead(500).end();
}

/** No se sube a WebSocket: se contesta en HTTP a mano (el socket aun no es de nadie) y se cierra. */
function refuseUpgrade(socket: Duplex, status: number): void {
  socket.end(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`);
}

/** La subida a WebSocket de la conexion de una sala: desde una web que puede, y a una sala que existe. */
function upgrader(rooms: NodeRooms, allowedOrigins: string): (incoming: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });
  return (incoming, socket, head) => {
    // Node no escucha los errores de un socket que se sube (un corte a medias tumbaria el proceso); `ws` pone los suyos despues.
    socket.on('error', () => socket.destroy());
    const origin = incoming.headers.origin ?? null;
    if (!isOriginAllowed(origin, allowedOrigins, incoming.headers.host)) return refuseUpgrade(socket, 403);
    const code = socketRoomCode(pathOf(incoming));
    if (code === null || !rooms.roomOf(code)) return refuseUpgrade(socket, 404);
    sockets.handleUpgrade(incoming, socket, head, (connection) => rooms.accept(code, connection));
  };
}

function listen(server: Server, port: number, hostname: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => resolve());
  });
}

/** Para todo: las salas sin alarmas ni conexiones y con todo guardado, y el servidor sin peticiones a medias. */
async function stop(server: Server, rooms: NodeRooms): Promise<void> {
  await rooms.shutDown();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
}

/** Arranca el servidor con las salas guardadas en `dataDir` (ya con sus alarmas puestas). */
export async function startServer(options: NodeServerOptions): Promise<RunningServer> {
  const files = await RoomFiles.open(options.dataDir);
  const rooms = await NodeRooms.open(files, options.maxRooms, options.now);
  const matchmaker = new Matchmaker(rooms, files.matchQueue(), options.now);
  const setup: ServerSetup = { rooms, matchmaker, allowedOrigins: options.allowedOrigins };
  const server = createServer((incoming, outgoing) => {
    answer(incoming, outgoing, setup, options.webDir).catch((error: unknown) => failRequest(outgoing, error));
  });
  server.maxConnections = options.maxConnections;
  server.on('upgrade', upgrader(rooms, options.allowedOrigins));
  await listen(server, options.port, options.hostname);
  const { port } = server.address() as AddressInfo;
  return { url: `http://localhost:${port}`, rooms, close: () => stop(server, rooms) };
}
