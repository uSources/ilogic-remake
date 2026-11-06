import { allianceScore, rivalScore } from '../../core/rules';
import { armyByDay } from '../../core/stats';
import { alliesOf, enemiesOf, perTeam, teamState, teamValue } from '../../core/teams';
import type { GameState, TeamId, TeamStats } from '../../core/model';
import type { EndStatsVM } from '../../hud/store';
import type { BySide } from '../../hud/vm/common';

/** Pantalla final: lo de la alianza de quien mira contra lo de todos sus enemigos juntos. */

const sumOver = (teams: readonly TeamId[], valueOf: (team: TeamId) => number): number =>
  teams.reduce((total, team) => total + valueOf(team), 0);

/** Un dato de la alianza de quien mira y el de sus enemigos, sumados. */
const bySide = (s: GameState, viewer: TeamId, valueOf: (team: TeamId) => number): BySide => [
  sumOver(alliesOf(s, viewer), valueOf),
  sumOver(enemiesOf(s, viewer), valueOf),
];

const statOf = (s: GameState, field: Exclude<keyof TeamStats, 'army'>) => (team: TeamId) => teamState(s, team).stats[field];

/** Compras, gasto, bajas y capturas de su alianza y de sus enemigos. */
export function endStatsVM(s: GameState, viewer: TeamId): EndStatsVM {
  return {
    built: bySide(s, viewer, statOf(s, 'built')),
    spent: bySide(s, viewer, statOf(s, 'spent')),
    lost: bySide(s, viewer, statOf(s, 'lost')),
    captured: bySide(s, viewer, statOf(s, 'captured')),
  };
}

/** Puntos para el limite de dias: [de su alianza, de la mejor alianza enemiga] (los que deciden quien gana). */
export const endScoreVM = (s: GameState, viewer: TeamId): BySide => [allianceScore(s, viewer), rivalScore(s, viewer)];

/** Valor de los ejercitos dia a dia, de su alianza y de sus enemigos (null con menos de dos dias apuntados). */
export function armyChartVM(s: GameState, viewer: TeamId): BySide[] | null {
  // Con un solo dia no hay grafica: un punto.
  if (s.day < 2) return null;
  const armies = perTeam(s, (team) => armyByDay(s, team));
  const onDay = (day: number) => bySide(s, viewer, (team) => teamValue(armies, team)[day] ?? 0);
  return Array.from({ length: s.day }, (_, day) => onDay(day));
}
