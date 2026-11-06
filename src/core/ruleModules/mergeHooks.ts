/** Juntar lo que aportan varias piezas en lo que aporta un modulo (las habilidades: una pieza por clase). */
import type { RuleHooks } from './hooks';

/** Las entradas de cada lista de `parts`, una detras de otra y en su orden. */
export function mergeHooks(parts: readonly RuleHooks[]): RuleHooks {
  const merged: Record<string, readonly unknown[]> = {};
  for (const part of parts)
    for (const [list, entries] of Object.entries(part) as [string, readonly unknown[]][])
      merged[list] = [...(merged[list] ?? []), ...entries];
  return merged;
}
