import type { Anchor } from './common';

/** Combate: prevision antes de atacar. */

export interface ForecastVM {
  attackerIcon: string | null;
  defenderIcon: string | null;
  low: number;
  high: number;
  expected: number;
  lifeBefore: number;
  lifeAfter: number;
  killChance: number;
  /** La casilla del objetivo (su chapa de daño va encima). */
  anchor: Anchor;
  /**
   * La casilla desde donde dispara tu unidad: su chapa del contraataque va a sus pies (si fuera encima,
   * junto al enemigo de al lado, chocaria con la del daño).
   */
  attackerAnchor: Anchor;
  /** [CAMBIO] Acierto extra por flanqueo, en tanto por uno (0 si no hay). */
  flank: number;
  /** [CAMBIO] Dinero que se cobraria al destruirla (0 sin botin). */
  bounty: number;
  /** Contraataque previsto sobre tu unidad (null si no habra). */
  counter: { low: number; high: number; lifeBefore: number; lifeAfter: number; killChance: number } | null;
}
