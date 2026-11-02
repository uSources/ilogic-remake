/**
 * [CAMBIO] Puntos de control (ver GameState.controlPoints): zonas que dan dinero cada ronda a quien
 * las tiene sin disputa.
 */
import { RULES } from '../data';
import type { GameState, Pos, Team } from '../types';

/** Lo que han dado los puntos de control en una ronda (ver RoundReport.control). */
export interface ControlReport {
  /** Dinero que ha dado a cada bando (ya sumado en RoundReport.income). */
  income: [number, number];
  /** Cuantos puntos le han pagado a cada bando. */
  held: [number, number];
  /** Cuantos estan disputados (no pagan a nadie). */
  contested: number;
}

/** [CAMBIO] La casilla esta dentro de la zona del punto de control (cuadrado de RULES.controlRadius). */
export function inControlZone(c: Pos, p: Pos): boolean {
  return Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= RULES.controlRadius;
}

/** [CAMBIO] Bandos con unidades dentro de la zona de un punto de control. */
export function teamsInZone(s: GameState, c: Pos): Set<Team> {
  return new Set(s.units.filter((u) => u.carrier === null && inControlZone(c, u)).map((u) => u.team));
}

/**
 * [CAMBIO] Puntos de control al acabar la ronda (ver GameState.controlPoints): solo paga el que no
 * esta disputado, para que haya batallas por ellos. Nada si la partida no tiene.
 */
export function controlRound(s: GameState): ControlReport | undefined {
  if (!s.controlPoints?.length) return undefined;
  const out: ControlReport = { income: [0, 0], held: [0, 0], contested: 0 };
  for (const c of s.controlPoints) {
    const teams = teamsInZone(s, c);
    if (teams.size > 1) {
      out.contested++;
      continue;
    }
    if (teams.size === 1) c.owner = [...teams][0]!;
    if (c.owner === null) continue;
    out.held[c.owner]++;
    out.income[c.owner] += RULES.controlIncome;
    s.funds[c.owner] += RULES.controlIncome;
  }
  return out;
}
