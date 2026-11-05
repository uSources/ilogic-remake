import { allianceScore, rivalScore } from '../../core/rules';
import { enemiesOf, teamState } from '../../core/teams';
import type { GameState, TeamId, TeamStats } from '../../core/model';
import type { BySide, EndStatsVM } from '../../hud/store';

/** Pantalla final: lo de quien mira contra lo de todos sus enemigos juntos. */

/** Un dato de quien mira y la suma del de sus enemigos. */
function bySide(s: GameState, viewer: TeamId, valueOf: (team: TeamId) => number): BySide {
  const enemies = enemiesOf(s, viewer).reduce((total, enemy) => total + valueOf(enemy), 0);
  return [valueOf(viewer), enemies];
}

const statOf = (s: GameState, field: Exclude<keyof TeamStats, 'army'>) => (team: TeamId) => teamState(s, team).stats[field];

/** Compras, gasto, bajas y capturas: [suyas, de sus enemigos]. */
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

/** Valor de los ejercitos dia a dia, [suyo, de sus enemigos] (null con menos de dos dias apuntados). */
export function armyChartVM(s: GameState, viewer: TeamId): BySide[] | null {
  const days = teamState(s, viewer).stats.army.length;
  if (days < 2) return null;
  const onDay = (day: number) => bySide(s, viewer, (team) => teamState(s, team).stats.army[day] ?? 0);
  return Array.from({ length: days }, (_, day) => onDay(day));
}
