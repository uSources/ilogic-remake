/**
 * [CAMBIO] Puntos de control (ver GameState.controlPoints): zonas que dan dinero cada ronda a quien
 * las tiene sin disputa.
 */
import { isOnMap } from '../util/predicates';
import { areAllied, perTeam, teamState } from '../teams';
import type { ControlPoint, GameState, Pos, TeamId } from '../model';

/** Lo que han dado los puntos de control en una ronda (ver RoundReport.control). */
export interface ControlReport {
  /** Dinero que ha dado a cada equipo, por numero de equipo (ya sumado en RoundReport.income). */
  income: number[];
  /** Cuantos puntos le han pagado a cada equipo. */
  held: number[];
  /** Cuantos estan disputados (no pagan a nadie). */
  contested: number;
}

/** [CAMBIO] La casilla esta dentro de la zona del punto de control (cuadrado de rules.controlRadius). */
export function inControlZone(s: GameState, center: Pos, pos: Pos): boolean {
  return Math.max(Math.abs(center.x - pos.x), Math.abs(center.y - pos.y)) <= s.rules.controlRadius;
}

/** [CAMBIO] Equipos con unidades dentro de la zona de un punto de control. */
export function teamsInZone(s: GameState, center: Pos): Set<TeamId> {
  return new Set(s.units.filter((unit) => isOnMap(unit) && inControlZone(s, center, unit)).map((unit) => unit.team));
}

/** [CAMBIO] Hay unidades de equipos enemigos dentro de la zona: nadie la tiene ese dia. */
export function isContested(s: GameState, center: Pos): boolean {
  const inside = [...teamsInZone(s, center)];
  return inside.some((team) => !areAllied(s, team, inside[0]!));
}

/**
 * El punto pasa a quien este dentro (de varios aliados, sigue siendo del que lo tenia, o del primero);
 * si no hay nadie, sigue siendo de quien era. Devuelve su dueño, o 'contested' si hay enemigos dentro.
 */
function updateOwner(s: GameState, point: ControlPoint): TeamId | null | 'contested' {
  if (isContested(s, point)) return 'contested';
  const inside = [...teamsInZone(s, point)].sort((first, second) => first - second);
  const keepsIt = point.owner !== null && inside.includes(point.owner);
  if (inside.length && !keepsIt) point.owner = inside[0]!;
  return point.owner;
}

/**
 * [CAMBIO] Puntos de control al acabar la ronda (ver GameState.controlPoints): solo paga el que no
 * esta disputado, para que haya batallas por ellos. Nada si la partida no tiene.
 */
export function controlRound(s: GameState): ControlReport | undefined {
  if (!s.controlPoints?.length) return undefined;
  const report: ControlReport = { income: perTeam(s, () => 0), held: perTeam(s, () => 0), contested: 0 };
  for (const point of s.controlPoints) {
    const owner = updateOwner(s, point);
    if (owner === 'contested') {
      report.contested++;
      continue;
    }
    if (owner === null) continue;
    report.held[owner]!++;
    report.income[owner]! += s.rules.controlIncome;
    teamState(s, owner).funds += s.rules.controlIncome;
  }
  return report;
}
