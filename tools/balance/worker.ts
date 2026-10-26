/** Hilo de trabajo: aplica la variante y juega un lote de partidas. */
import { parentPort, workerData } from 'node:worker_threads';
import { playGame, type Policy } from './play';
import { applyVariant, type Variant } from './variant';

const data = workerData as { variant: Variant; seeds: number[]; maxDays: number; policies: [Policy, Policy] };
applyVariant(data.variant);
for (const seed of data.seeds) {
  const rec = playGame({ seed, maxDays: data.maxDays, policies: data.policies });
  parentPort!.postMessage(rec);
}
