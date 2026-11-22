/**
 * Las salas en Node: todas en un proceso y en memoria, cada una con su `HostedRoom` (lo mismo que en
 * Cloudflare) y lo que aqui le da Node: su fichero (roomFiles.ts), sus conexiones de `ws` y un
 * `setTimeout` como alarma. Al arrancar se cargan las guardadas y se ponen sus alarmas: una sala
 * caduca, o pasa el turno de quien se quedo sin tiempo, aunque nadie la toque. Es el `RoomDirectory`
 * de las rutas; las conexiones llegan aparte, ya subidas a WebSocket (`accept`).
 */
import type { RawData, WebSocket } from 'ws';
import type { SeatId } from '@core/net';
import { CLOSE_CODES, HostedRoom, type CreateResult, type HandToAiResult, type RawMessage } from '../../src/hostedRoom';
import type { LobbyInfo } from '../../src/roomAdapter';
import type { RoomHost, StoredRoom } from '../../src/roomHost';
import type { RoomRequest } from '../../src/roomRequest';
import type { RoomDirectory } from '../../src/routes';
import { NodeSocket } from './nodeSocket';
import type { RoomFile, RoomFiles } from './roomFiles';

/**
 * Lo mas que espera `setTimeout` (2^31 - 1 ms, casi 25 dias; con mas, salta enseguida). Una alarma
 * mas lejana (la caducidad, a 30 dias) suena antes de tiempo, no encuentra nada vencido y se vuelve a poner.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** El codigo con el que se cierran las conexiones al parar el servidor (1001: «se va»). */
const GOING_AWAY = 1001;

/** Lo que falle atendiendo una sala se apunta y no tira el proceso: las demas salas siguen. */
export function reportFailure(task: Promise<void>): void {
  task.catch((error: unknown) => console.error('Fallo atendiendo una sala:', error));
}

/** Lo que llega por `ws` en una trama, en bytes (con la configuracion de siempre, un Buffer). */
function bufferOf(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/** Una trama de texto es un mensaje (JSON); una de bytes, no (la sala la rechaza). */
const messageOf = (data: RawData, isBinary: boolean): RawMessage => (isBinary ? bufferOf(data) : bufferOf(data).toString('utf8'));

/** Una sala del proceso: su `HostedRoom` y lo que le da Node. */
class NodeRoom implements RoomHost {
  readonly connections = new Set<NodeSocket>();
  readonly room: HostedRoom = new HostedRoom(this);
  private alarm: NodeJS.Timeout | null = null;
  /** El servidor se esta apagando: lo que llegue ya no se guarda (las conexiones que se cierran solo dirian que se han ido). */
  private isShutDown = false;

  constructor(
    private readonly file: RoomFile,
    readonly now: () => number,
    private readonly onErase: () => void,
  ) {}

  load(): Promise<StoredRoom | null> {
    return this.file.load();
  }

  async save(room: StoredRoom, wakeAt: number): Promise<void> {
    if (this.isShutDown) return;
    await this.file.save(room);
    this.setAlarm(wakeAt);
  }

  async erase(): Promise<void> {
    if (this.isShutDown) return;
    this.clearAlarm();
    await this.file.erase();
    this.onErase();
  }

  sockets(): NodeSocket[] {
    return [...this.connections];
  }

  /** Una conexion nueva: sus mensajes y su cierre van a la sala. */
  accept(socket: WebSocket): void {
    const connection = new NodeSocket(socket);
    this.connections.add(connection);
    socket.on('message', (data, isBinary) => reportFailure(this.room.receive(connection, messageOf(data, isBinary))));
    socket.on('close', () => {
      this.connections.delete(connection);
      reportFailure(this.room.forget(connection));
    });
  }

  /** Al parar el servidor: sin alarma, con las conexiones cerradas y lo que se estaba guardando, ya en disco. */
  shutDown(): Promise<void> {
    this.isShutDown = true;
    this.clearAlarm();
    for (const connection of this.connections) connection.close(GOING_AWAY, 'El servidor se apaga');
    return this.file.settled();
  }

  private setAlarm(at: number): void {
    this.clearAlarm();
    const delay = Math.min(Math.max(at - this.now(), 0), MAX_TIMEOUT_MS);
    // Sin `unref`, una alarma lejana tendria el proceso vivo aunque todo lo demas hubiera parado.
    this.alarm = setTimeout(() => reportFailure(this.room.ring()), delay).unref();
  }

  private clearAlarm(): void {
    if (this.alarm) clearTimeout(this.alarm);
    this.alarm = null;
  }
}

export class NodeRooms implements RoomDirectory {
  private readonly rooms = new Map<string, NodeRoom>();

  private constructor(
    private readonly files: RoomFiles,
    private readonly now: () => number,
  ) {}

  /** Las salas de esa carpeta, en memoria y con sus alarmas puestas (la que no se puede recuperar se borra). */
  static async open(files: RoomFiles, now: () => number = Date.now): Promise<NodeRooms> {
    const rooms = new NodeRooms(files, now);
    for (const code of await files.codes()) await rooms.wake(code);
    return rooms;
  }

  create(code: string, request: RoomRequest): Promise<CreateResult> {
    if (this.rooms.has(code)) return Promise.resolve({ ok: false, error: 'exists' });
    return this.add(code).room.create(request);
  }

  info(code: string): Promise<LobbyInfo | null> {
    return this.roomOf(code)?.info() ?? Promise.resolve(null);
  }

  handToAi(code: string, token: string, seat: SeatId): Promise<HandToAiResult> {
    return this.roomOf(code)?.handToAi(token, seat) ?? Promise.resolve({ ok: false, error: 'noSuchRoom' });
  }

  /** En Node las subidas a WebSocket las atiende el servidor HTTP antes que las rutas (`accept`): lo que llega aqui no es una de verdad. */
  connect(): Promise<Response> {
    return Promise.resolve(new Response('Se esperaba una subida a WebSocket', { status: 426 }));
  }

  /** La sala de ese codigo, o null si no hay. */
  roomOf(code: string): HostedRoom | null {
    return this.rooms.get(code)?.room ?? null;
  }

  /** Una conexion a la sala, ya subida a WebSocket. */
  accept(code: string, socket: WebSocket): void {
    const entry = this.rooms.get(code);
    if (!entry) return socket.close(CLOSE_CODES.gone, 'La sala ya no existe');
    entry.accept(socket);
  }

  /** Al parar el servidor: ninguna alarma mas, todas las conexiones cerradas y todo guardado. */
  async shutDown(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((entry) => entry.shutDown()));
  }

  private add(code: string): NodeRoom {
    const entry: NodeRoom = new NodeRoom(this.files.fileOf(code), this.now, () => this.forget(code, entry));
    this.rooms.set(code, entry);
    return entry;
  }

  /** La sala se ha borrado (si con su codigo hay ya otra, esa se queda). */
  private forget(code: string, entry: NodeRoom): void {
    if (this.rooms.get(code) === entry) this.rooms.delete(code);
  }

  /** Una sala guardada, en memoria y con su alarma; si no se puede recuperar, fuera. */
  private async wake(code: string): Promise<void> {
    const entry = this.add(code);
    if (!(await entry.room.exists())) this.forget(code, entry);
  }
}
