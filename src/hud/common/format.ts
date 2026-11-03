import { fmtNum, t } from '../../settings';

/** Probabilidad para el jugador: "35%", "<1%", ">99%" (nunca 0% ni 100% si no lo es del todo). */
export function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.01) return t('lessThan1');
  if (p > 0.99) return t('moreThan99');
  return `${Math.round(p * 100)}%`;
}

/** Cantidad con signo: "+1.200", "−300". */
export const signed = (n: number) => `${n < 0 ? '−' : '+'}${fmtNum(Math.abs(n))}`;

/** Rango de daño: "30" si es fijo, "20–40" si no. */
export const range = (low: number, high: number) => (low === high ? String(low) : `${low}–${high}`);

/** Estrellas de veterania o de coste: "★★". */
export const stars = (n: number) => '★'.repeat(n);
