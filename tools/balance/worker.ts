/**
 * Hilo de trabajo: carga el nucleo con el contenido de la variante (contentHook.mjs) y hace su
 * trabajo: un lote de partidas o la tabla de duelos. Nada del nucleo se importa antes de registrar
 * el enganche: si no, el hilo jugaria con el contenido de siempre.
 */
import { register } from 'node:module';
import { parentPort, workerData } from 'node:worker_threads';
import type { WorkerJob } from './runner';

const job = workerData as WorkerJob;
register('./contentHook.mjs', import.meta.url, { data: job.content });

if (job.kind === 'games') {
  const { playGame } = await import('./play');
  for (const seed of job.seeds) parentPort!.postMessage(playGame({ ...job.game, seed, rules: job.rules }));
} else {
  const { duelMatrix } = await import('./duel');
  parentPort!.postMessage(duelMatrix({ ...job.duel, rules: job.rules }));
}
