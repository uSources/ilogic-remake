/**
 * Las salas guardadas en disco: un JSON por sala (`<codigo>.json`) en una carpeta, que se puede
 * copiar, mirar o borrar a mano, y la cola del emparejador (`emparejador.json`: no es un codigo de
 * sala, asi que no se lee como una). Cada escritura va primero a un fichero aparte que despues se
 * renombra (si el proceso muere a medias, queda entera la de antes), y las de una sala van en fila:
 * si dos mensajes seguidos guardan a la vez, queda la del ultimo, no la que acabe antes (las de la
 * cola ya van en fila: el emparejador busca de una en una).
 */
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isRoomCode } from '@core/net';
import { isObject } from '@core/util/validation';
import type { MatchQueueStore } from '../../src/matchmaker';
import type { StoredRoom } from '../../src/roomHost';

const EXTENSION = '.json';
const QUEUE_FILE = 'emparejador.json';

/** La carpeta de las salas. */
export class RoomFiles {
  private constructor(private readonly dir: string) {}

  /** La carpeta (si no existe, se crea). */
  static async open(dir: string): Promise<RoomFiles> {
    await mkdir(dir, { recursive: true });
    return new RoomFiles(dir);
  }

  /** Los codigos de las salas guardadas. */
  async codes(): Promise<string[]> {
    const names = await readdir(this.dir);
    return names
      .filter((name) => name.endsWith(EXTENSION))
      .map((name) => name.slice(0, -EXTENSION.length))
      .filter(isRoomCode);
  }

  fileOf(code: string): RoomFile {
    return new RoomFile(join(this.dir, `${code}${EXTENSION}`));
  }

  /** Donde guarda su cola el emparejador (si no hay fichero, o no se puede leer, la cola empieza vacia). */
  matchQueue(): MatchQueueStore {
    const path = join(this.dir, QUEUE_FILE);
    return {
      load: async () => parsed((await readIfExists(path)) ?? 'null'),
      save: (queue) => writeWhole(path, JSON.stringify(queue)),
    };
  }
}

/** El fichero de una sala. */
export class RoomFile {
  /** La ultima escritura (o borrado) en marcha: la siguiente va detras. */
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) {}

  /** La sala guardada, o null si no hay (o lo que hay no es una sala: se dice y no se carga). Despues de lo que haya en marcha. */
  async load(): Promise<StoredRoom | null> {
    await this.settled();
    const text = await readIfExists(this.path);
    if (text === null) return null;
    const stored = parsed(text);
    if (isStoredRoom(stored)) return stored;
    console.error(`${this.path} no es una sala guardada: no se carga`);
    return null;
  }

  save(room: StoredRoom): Promise<void> {
    return this.queue(() => writeWhole(this.path, JSON.stringify(room)));
  }

  erase(): Promise<void> {
    return this.queue(() => rm(this.path, { force: true }));
  }

  /** Cuando acaba lo que haya en marcha (haya ido bien o no). */
  settled(): Promise<void> {
    return this.pending.catch(() => undefined);
  }

  /** Detras de lo que haya en marcha (aunque haya fallado: un fallo no para las siguientes). */
  private queue(task: () => Promise<void>): Promise<void> {
    this.pending = this.pending.then(task, task);
    return this.pending;
  }
}

/** Tiene la forma de una sala guardada (lo de dentro de la sala lo comprueba `Room.restore`; los relojes son del servidor). */
const isStoredRoom = (value: unknown): value is StoredRoom => isObject(value) && 'snapshot' in value && isObject(value.meta);

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isMissing = (error: unknown): boolean => isObject(error) && error.code === 'ENOENT';

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** Escribe el fichero entero o nada: primero al de al lado y luego se cambia por el de verdad. */
async function writeWhole(path: string, text: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
}
