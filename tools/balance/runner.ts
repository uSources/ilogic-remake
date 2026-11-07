/**
 * Juega variantes en hilos (lo usan npm run balance y npm run metrics). Cada hilo recibe los ficheros
 * de contenido de la variante, los carga (loadContent: valida y congela) y juega con ese contenido y
 * sus reglas (worker.ts).
 */
import { Worker } from 'node:worker_threads';
import type { Content } from '@core/content';
import type { DeepReadonly } from '@core/util/freeze';
import type { DuelCell, DuelOptions } from './duel';
import { DEFAULT_MAP_SIZE } from '@core/match';
import type { TeamId } from '@core/model';
import { FIRST_TEAM, type GameRecord, type PlayOptions, type Policy } from './play';
import type { VariantSetup } from './variant';

/** Lo que hace un hilo, con los ficheros de contenido de la variante. */
export type WorkerJob = { files: DeepReadonly<Content> } & (
  | { kind: 'games'; seeds: number[]; game: Omit<PlayOptions, 'seed' | 'settings' | 'content'> }
  | { kind: 'duels'; duel: Omit<DuelOptions, 'settings' | 'content'> }
);

/** Lanza un hilo con un trabajo y pasa cada mensaje que devuelve a `onMessage`. */
function runWorker<T>(job: WorkerJob, onMessage: (message: T) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { workerData: job, execArgv: ['--import', 'tsx'] });
    worker.on('message', onMessage);
    worker.on('error', reject);
    worker.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`hilo terminado con codigo ${code}`))));
  });
}

/** Que partidas jugar: con que semillas, cuantos dias, quien juega cada equipo y en cuantos hilos. */
export interface GamesRun {
  seeds: readonly number[];
  maxDays: number;
  /** Quien juega cada equipo (hay tantos equipos como politicas). */
  policies: readonly Policy[];
  threads: number;
  /** El equipo que mueve primero (si no, FIRST_TEAM). */
  firstTeam?: TeamId;
  /** Cuantos puestos giran las salidas (si no, 0: como salen del mapa). */
  rotateStarts?: number;
  /** Lado del mapa (si no, DEFAULT_MAP_SIZE). */
  size?: number;
}

export async function runGames(setup: VariantSetup, run: GamesRun): Promise<GameRecord[]> {
  const { seeds, maxDays, policies, threads, firstTeam = FIRST_TEAM, rotateStarts = 0, size = DEFAULT_MAP_SIZE } = run;
  const chunks: number[][] = Array.from({ length: threads }, () => []);
  seeds.forEach((seed, index) => chunks[index % threads]!.push(seed));
  const records: GameRecord[] = [];
  const started = Date.now();
  const game = { maxDays, policies, firstTeam, rotateStarts, size };
  const progress = () => {
    if (process.stderr.isTTY || records.length % 25 === 0 || records.length === seeds.length)
      process.stderr.write(`\r  ${records.length}/${seeds.length} partidas (${((Date.now() - started) / 1000).toFixed(0)} s)   `);
  };
  const jobs = chunks
    .filter((chunk) => chunk.length)
    .map((chunk) =>
      runWorker<GameRecord>({ files: setup.content.files, kind: 'games', seeds: chunk, game }, (record) => {
        records.push(record);
        progress();
      }),
    );
  await Promise.all(jobs);
  process.stderr.write('\n');
  return records.sort((first, second) => first.seed - second.seed);
}

/** La tabla de duelos (duel.ts) con el contenido y las reglas de la variante. */
export async function runDuels(setup: VariantSetup, duel: Omit<DuelOptions, 'settings' | 'content'>): Promise<DuelCell[]> {
  let cells: DuelCell[] = [];
  await runWorker<DuelCell[]>({ files: setup.content.files, kind: 'duels', duel }, (result) => (cells = result));
  return cells;
}
