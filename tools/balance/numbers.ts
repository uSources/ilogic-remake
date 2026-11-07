/** Las cuentas de los informes (equilibrio y nota del juego), una sola vez para que todos cuenten igual. */

/** La media; 0 sin valores. */
export const mean = (values: readonly number[]): number => (values.length ? sum(values) / values.length : 0);

export const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * El valor que deja por debajo la fraccion `fraction` de los valores (0.5: la mediana, el del medio o,
 * con un numero par, el primero de la mitad de arriba); 0 sin valores.
 */
export function quantile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!;
}

export const median = (values: readonly number[]): number => quantile(values, 0.5);

export const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

export const pct = (fraction: number): string => `${Math.round(fraction * 100)} %`;
