/** Hilo de trabajo: aplica la variante y juega un lote de partidas. */
import { parentPort, workerData } from 'node:worker_threads';
import { playGame, type Policy } from './play';
import { applyVariant, type Variant } from './variant';

const data = workerData as {
  variant: Variant;
  seeds: number[];
  maxDays: number;
  policies: [Policy, Policy];
  firstTeam?: 0 | 1;
  swapSides?: boolean;
  size?: number;
};
applyVariant(data.variant);
for (const seed of data.seeds) {
  const rec = playGame({
    seed,
    maxDays: data.maxDays,
    policies: data.policies,
    firstTeam: data.firstTeam,
    swapSides: data.swapSides,
    size: data.size,
  });
  parentPort!.postMessage(rec);
}
