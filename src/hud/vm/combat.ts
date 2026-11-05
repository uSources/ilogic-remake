import type { Anchor, Side } from './common';

/** Combate: prevision antes de atacar y panel mientras se anima un ataque. */

export interface ForecastVM {
  attackerIcon: string | null;
  defenderIcon: string | null;
  low: number;
  high: number;
  expected: number;
  lifeBefore: number;
  lifeAfter: number;
  killChance: number;
  anchor: Anchor;
  /** [CAMBIO] Acierto extra por flanqueo, en tanto por uno (0 si no hay). */
  flank: number;
  /** [CAMBIO] Dinero que se cobraria al destruirla (0 sin botin). */
  bounty: number;
  /** Contraataque previsto sobre tu unidad (null si no habra). */
  counter: { low: number; high: number; lifeBefore: number; lifeAfter: number; killChance: number } | null;
}

/** Un lado del panel de combate. */
export interface CombatSideVM {
  icon: string | null;
  /** Nombre de la unidad ('???' si no se ve). */
  name: string;
  side: Side;
  role: 'attacker' | 'defender';
  /** Rango de veterania 0..3. */
  rank: number;
  /** Vida que se enseña en este momento del combate y la de antes de empezar. */
  life: number;
  lifeBefore: number;
  /** Probabilidad de acierto de sus disparos (0..1), o null si no dispara o no se ve. */
  hit: number | null;
  /** Daño recibido hasta este momento (null = aun nada). */
  hurt: number | null;
  ko: boolean;
}

/**
 * Panel de combate: se enseña mientras se anima un ataque (tuyo o del enemigo). Tu unidad siempre
 * a la izquierda. `stage` dice por donde va: antes de disparar, tras el ataque o tras el contraataque.
 */
export interface CombatVM {
  id: number;
  stage: 'start' | 'hit' | 'counter';
  left: CombatSideVM;
  right: CombatSideVM;
  /** Habra (o hubo) contraataque. */
  counter: boolean;
}
