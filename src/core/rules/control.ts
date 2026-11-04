/**
 * [CAMBIO] Puntos de control (ver GameState.controlPoints): zonas que dan dinero cada ronda a quien
 * las tiene sin disputa.
 */
import { RULES } from '../data';
import { isOnMap } from '../util/predicates';
import type { ControlPoint, GameState, Pos, Team } from '../types';

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
export function inControlZone(center: Pos, pos: Pos): boolean {
  return Math.max(Math.abs(center.x - pos.x), Math.abs(center.y - pos.y)) <= RULES.controlRadius;
}

/** [CAMBIO] Bandos con unidades dentro de la zona de un punto de control. */
export function teamsInZone(s: GameState, center: Pos): Set<Team> {
  return new Set(s.units.filter((unit) => isOnMap(unit) && inControlZone(center, unit)).map((unit) => unit.team));
}

/**
 * Pasa el punto a quien este solo dentro (si no hay nadie, sigue siendo de quien era) y devuelve
 * su dueño; 'contested' si hay unidades de los dos bandos.
 */
function updateOwner(s: GameState, point: ControlPoint): Team | null | 'contested' {
  const teams = teamsInZone(s, point);
  if (teams.size > 1) return 'contested';
  if (teams.size === 1) point.owner = [...teams][0]!;
  return point.owner;
}

/**
 * [CAMBIO] Puntos de control al acabar la ronda (ver GameState.controlPoints): solo paga el que no
 * esta disputado, para que haya batallas por ellos. Nada si la partida no tiene.
 */
export function controlRound(s: GameState): ControlReport | undefined {
  if (!s.controlPoints?.length) return undefined;
  const report: ControlReport = { income: [0, 0], held: [0, 0], contested: 0 };
  for (const point of s.controlPoints) {
    const owner = updateOwner(s, point);
    if (owner === 'contested') {
      report.contested++;
      continue;
    }
    if (owner === null) continue;
    report.held[owner]++;
    report.income[owner] += RULES.controlIncome;
    s.funds[owner] += RULES.controlIncome;
  }
  return report;
}
