/** Juega muchas partidas IA contra IA en varios hilos (lo usan npm run balance y npm run metrics). */
import { Worker } from 'node:worker_threads';
import type { GameRecord, Policy } from './play';
import type { Variant } from './variant';

export async function runGames(
  variant: Variant,
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
  let done = 0;
  const started = Date.now();
  await Promise.all(
    chunks
      .filter((c) => c.length)
      .map(
        (c) =>
          new Promise<void>((resolve, reject) => {
            const w = new Worker(new URL('./worker.ts', import.meta.url), {
              workerData: { variant, seeds: c, maxDays, policies, firstTeam, swapSides, size },
              execArgv: ['--import', 'tsx'],
            });
            w.on('message', (r: GameRecord) => {
              records.push(r);
              done++;
              if (process.stderr.isTTY || done % 25 === 0 || done === seeds.length)
                process.stderr.write(`\r  ${done}/${seeds.length} partidas (${((Date.now() - started) / 1000).toFixed(0)} s)   `);
            });
            w.on('error', reject);
            w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`hilo terminado con codigo ${code}`))));
          }),
      ),
  );
  process.stderr.write('\n');
  return records.sort((x, y) => x.seed - y.seed);
}

