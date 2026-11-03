/**
 * Elegir el mejor de una lista segun uno o varios criterios, en vez de llevar a mano `best`,
 * `bestScore`, `bestCost`... (docs/ESTILO.md, regla 5).
 */

/** Un criterio (un numero) o varios en orden: el segundo solo decide si el primero empata. */
export type SortKey = number | readonly number[];

/** Compara dos claves: -1 si `a` va antes, 1 si va despues, 0 si empatan. */
export function compareKeys(a: SortKey, b: SortKey): number {
  const left = typeof a === 'number' ? [a] : a;
  const right = typeof b === 'number' ? [b] : b;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    // Comparar en vez de restar: Infinity - Infinity da NaN.
    const leftPart = left[i] ?? 0;
    const rightPart = right[i] ?? 0;
    if (leftPart < rightPart) return -1;
    if (leftPart > rightPart) return 1;
  }
  return 0;
}

/** El elemento con la clave mas baja. Si empatan, el primero. null si la lista esta vacia. */
export function minBy<T>(items: Iterable<T>, key: (item: T) => SortKey): T | null {
  let best: T | null = null;
  let bestKey: SortKey = 0;
  for (const item of items) {
    const itemKey = key(item);
    if (best === null || compareKeys(itemKey, bestKey) < 0) {
      best = item;
      bestKey = itemKey;
    }
  }
  return best;
}

/** El elemento con la clave mas alta. Si empatan, el primero. null si la lista esta vacia. */
export function maxBy<T>(items: Iterable<T>, key: (item: T) => SortKey): T | null {
  return minBy(items, (item) => {
    const itemKey = key(item);
    return typeof itemKey === 'number' ? -itemKey : itemKey.map((part) => -part);
  });
}
