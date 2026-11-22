/**
 * El servidor de Node para una tanda de pruebas (un `describe`): arranca antes, en un puerto libre,
 * con una carpeta de salas nueva y una hora que se adelanta a mano (`advance`, y `ring` hace sonar la
 * alarma de una sala sin esperarla), y para despues. Da el `TestServer` de las pruebas comunes.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { TestServer } from '../../test/shared/testServer';
import { startServer, type RunningServer } from '../src/nodeServer';
import { RoomFiles } from '../src/roomFiles';

export interface NodeTestServer {
  /** Para las pruebas comunes (y los clientes de prueba). */
  readonly server: TestServer;
  /** Adelanta la hora del servidor. */
  advance(milliseconds: number): void;
  /** Hace sonar ya la alarma de una sala. */
  ring(code: string): Promise<void>;
  /** Para el servidor (cerrando las conexiones) y arranca otro con las mismas salas guardadas. */
  restart(): Promise<void>;
}

/** Una conexion con la sala desde una pagina de ese origen, ya abierta (el WebSocket de Node deja poner la cabecera). */
function openSocket(url: string, origin: string): Promise<WebSocket> {
  const socket = new WebSocket(url, { headers: { Origin: origin } });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', () => reject(new Error(`No se abre ${url}`)));
  });
}

/** El servidor de Node de las pruebas de este `describe`; `webDir`, la carpeta del juego si se sirve. */
export function useNodeServer(webDir: string | null = null): NodeTestServer {
  let now = Date.now();
  let dataDir = '';
  let running: RunningServer | null = null;

  const current = (): RunningServer => {
    if (!running) throw new Error('El servidor de prueba no ha arrancado');
    return running;
  };
  const start = async (): Promise<void> => {
    running = await startServer({ port: 0, dataDir, webDir, allowedOrigins: 'https://usources.github.io,null', now: () => now });
  };

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'ilogic-salas-'));
    await start();
  });
  afterAll(async () => {
    await running?.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const server: TestServer = {
    fetch: (path, init) => fetch(`${current().url}${path}`, init),
    openSocket: (code, origin) => openSocket(`${current().url.replace(/^http/, 'ws')}/rooms/${code}/ws`, origin),
    stored: async (code) => (await RoomFiles.open(dataDir)).fileOf(code).load(),
  };
  return {
    server,
    advance: (milliseconds) => (now += milliseconds),
    ring: async (code) => {
      const room = current().rooms.roomOf(code);
      if (!room) throw new Error(`No hay sala ${code}`);
      await room.ring();
    },
    restart: async () => {
      await current().close();
      await start();
    },
  };
}
