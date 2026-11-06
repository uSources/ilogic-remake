/**
 * [CAMBIO] Puntos de control (ver GameState.controlPoints): zonas que dan dinero cada ronda a quien
 * las tiene sin disputa.
 */
import { isOnMap } from '../util/predicates';
import { posOf } from '../geom';
import { addForTeam, areAllied, perTeam, teamIds } from '../teams';
import { earn } from './funds';
import type { ControlPoint, GameEvent, GameState, Pos, TeamId } from '../model';

/** [CAMBIO] La casilla esta dentro de la zona del punto de control (cuadrado de rules.controlRadius). */
export function inControlZone(s: GameState, center: Pos, pos: Pos): boolean {
  return Math.max(Math.abs(center.x - pos.x), Math.abs(center.y - pos.y)) <= s.settings.controlRadius;
}

/** [CAMBIO] Equipos con unidades dentro de la zona de un punto de control. */
export function teamsInZone(s: GameState, center: Pos): Set<TeamId> {
  return new Set(s.units.filter((unit) => isOnMap(unit) && inControlZone(s, center, unit)).map((unit) => unit.team));
}

/** [CAMBIO] Hay unidades de equipos enemigos dentro de la zona: nadie la tiene ese dia. */
export function isContested(s: GameState, center: Pos): boolean {
  const [first, ...others] = teamsInZone(s, center);
  return first !== undefined && others.some((team) => !areAllied(s, team, first));
}

/**
 * El punto pasa a quien este dentro (de varios aliados, sigue siendo del que lo tenia, o del primero);
 * si no hay nadie, sigue siendo de quien era. Devuelve su dueño, o 'contested' si hay enemigos dentro.
 */
function updateOwner(s: GameState, point: ControlPoint): TeamId | null | 'contested' {
  if (isContested(s, point)) return 'contested';
  const inside = [...teamsInZone(s, point)].sort((first, second) => first - second);
  const keepsIt = point.owner !== null && inside.includes(point.owner);
  const [newcomer] = inside;
  if (newcomer !== undefined && !keepsIt) point.owner = newcomer;
  return point.owner;
}

/**
 * [CAMBIO] Puntos de control al acabar la ronda (ver GameState.controlPoints): solo paga el que no
 * esta disputado, para que haya batallas por ellos. Un suceso por punto (de quien queda y si esta
 * disputado) y otro por equipo con lo que cobra; nada si la partida no tiene.
 */
export function controlRound(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const income = perTeam(s, () => 0);
  for (const point of s.controlPoints ?? []) {
    const owner = updateOwner(s, point);
    const contested = owner === 'contested';
    events.push({ kind: 'controlPoint', actor: null, at: posOf(point), owner: point.owner, contested });
    if (contested || owner === null) continue;
    addForTeam(income, owner, s.settings.controlIncome);
    earn(s, owner, s.settings.controlIncome);
  }
  for (const team of teamIds(s))
    if (income[team]) events.push({ kind: 'income', actor: null, team, amount: income[team], source: 'controlPoints' });
  return events;
}
