/**
 * Juega variantes en hilos (lo usan npm run balance y npm run metrics). Cada hilo carga el nucleo con
 * el contenido de la variante (worker.ts): el de este proceso no cambia nunca.
 */
import { Worker } from 'node:worker_threads';
import type { GameContent } from '@core/content';
import type { RulesConfig } from '@core/model';
import type { DuelCell, DuelOptions } from './duel';
import type { GameRecord, PlayOptions, Policy } from './play';
import type { VariantSetup } from './variant';

/** Lo que hace un hilo, con el contenido y las reglas de la variante. */
export type WorkerJob = { content: GameContent; rules: RulesConfig } & (
  { kind: 'games'; seeds: number[]; game: Omit<PlayOptions, 'seed' | 'rules'> } | { kind: 'duels'; duel: Omit<DuelOptions, 'rules'> }
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

export async function runGames(
  setup: VariantSetup,
  seeds: number[],
  maxDays: number,
  policies: [Policy, Policy],
  threads: number,
  firstTeam: 0 | 1 = 0,
  swapSides = false,
  size = 32,
): Promise<GameRecord[]> {
  const chunks: number[][] = Array.from({ length: threads }, () => []);
  seeds.forEach((s, i) => chunks[i % threads]!.push(s));
  const records: GameRecord[] = [];
  const started = Date.now();
  const game = { maxDays, policies, firstTeam, swapSides, size };
  const progress = () => {
    if (process.stderr.isTTY || records.length % 25 === 0 || records.length === seeds.length)
      process.stderr.write(`\r  ${records.length}/${seeds.length} partidas (${((Date.now() - started) / 1000).toFixed(0)} s)   `);
  };
  const jobs = chunks
    .filter((chunk) => chunk.length)
    .map((chunk) =>
      runWorker<GameRecord>({ content: setup.content, rules: setup.rules, kind: 'games', seeds: chunk, game }, (record) => {
        records.push(record);
        progress();
      }),
    );
  await Promise.all(jobs);
  process.stderr.write('\n');
  return records.sort((x, y) => x.seed - y.seed);
}

/** La tabla de duelos (duel.ts) con el contenido y las reglas de la variante. */
export async function runDuels(setup: VariantSetup, duel: Omit<DuelOptions, 'rules'>): Promise<DuelCell[]> {
  let cells: DuelCell[] = [];
  await runWorker<DuelCell[]>({ content: setup.content, rules: setup.rules, kind: 'duels', duel }, (result) => (cells = result));
  return cells;
}
