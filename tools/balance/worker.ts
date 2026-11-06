/**
 * Hilo de trabajo: un lote de partidas o la tabla de duelos con el contenido de la variante (los
 * ficheros que le pasa runner.ts, cargados aqui) y sus reglas (cada partida lleva el suyo: el nucleo
 * no tiene uno global).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { loadContent } from '@core/content';
import { settingsWith } from '@core/matchSettings';
import { duelMatrix } from './duel';
import { playGame } from './play';
import type { WorkerJob } from './runner';

const job = workerData as WorkerJob;
// Los ficheros se vuelven a cargar en el hilo: validados, con todas sus tablas y congelados.
const content = loadContent(job.files);
const settings = settingsWith(content);

if (job.kind === 'games') {
  for (const seed of job.seeds) parentPort!.postMessage(playGame({ ...job.game, seed, settings, content }));
} else {
  parentPort!.postMessage(duelMatrix({ ...job.duel, settings, content }));
}
