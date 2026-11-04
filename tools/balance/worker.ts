/**
 * Hilo de trabajo: un lote de partidas o la tabla de duelos, con el contenido y las reglas de la
 * variante que le pasa runner.ts (cada partida lleva el suyo: el nucleo no tiene uno global).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { deepFreeze } from '@core/util/freeze';
import { duelMatrix } from './duel';
import { playGame } from './play';
import type { WorkerJob } from './runner';

const job = workerData as WorkerJob;
// Al pasar al hilo se copia y pierde la congelacion: se vuelve a congelar, como el del juego.
const content = deepFreeze(job.content);
const rules = Object.freeze(job.rules);

if (job.kind === 'games') {
  for (const seed of job.seeds) parentPort!.postMessage(playGame({ ...job.game, seed, rules, content }));
} else {
  parentPort!.postMessage(duelMatrix({ ...job.duel, rules, content }));
}
