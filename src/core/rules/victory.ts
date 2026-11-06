/**
 * Como acaba una partida, igual para todos los equipos (`MatchResult`): las formas de acabar estan
 * en `VICTORY_RULES`, una por `VictoryRuleId`, y cada modo de juego dice las suyas y en que orden
 * (`GAME_MODES`, core/modes.ts). La primera que decide, manda. Nada aqui es "ganado" o "perdido" de
 * un equipo: el resultado dice quien gana (`winners`, una alianza entera) o que nadie (empate).
 * Lo que mide cada objetivo de mision esta en objectives.ts.
 */
import { gameModeOf } from '../modes';
import { armyValue } from '../stats';
import { measureObjective, objectiveStatus, type ObjectiveProgress } from '../objectives';
import { alliesOf, enemiesOf, teamIds, teamState } from '../teams';
import { maxBy } from '../util/pick';
import type { Building, EndReason, GameState, MatchResult, TeamId, VictoryRuleId } from '../model';
import { isDefeated, lastFallen, mainFall, type FallenTeam } from './falls';

/** Puntos que vale cada edificio para el limite de dias. */
const BUILDING_SCORE = 1000;

const buildingsOf = (s: GameState, team: TeamId): Building[] => s.buildings.filter((building) => building.owner === team);

/**
 * Puntos de un equipo para el limite de dias: valor de su ejercito (coste x vida/100)
 * mas 1000 por cada edificio.
 */
export function score(s: GameState, team: TeamId): number {
  return armyValue(s, team) + BUILDING_SCORE * buildingsOf(s, team).length;
}

/** El limite de dias (si lo hay) ya se ha cumplido. */
export const dayLimitReached = (s: GameState): boolean => s.settings.dayLimit !== null && s.day > s.settings.dayLimit;

/** Lo que suma una alianza (la de `team`): sus puntos y sus edificios. */
function allianceStanding(s: GameState, team: TeamId): { points: number; buildings: number } {
  const allies = alliesOf(s, team);
  const sum = (count: (ally: TeamId) => number) => allies.reduce((total, ally) => total + count(ally), 0);
  return { points: sum((ally) => score(s, ally)), buildings: sum((ally) => buildingsOf(s, ally).length) };
}

/** Los puntos de la alianza de `team` (los suyos y los de sus aliados), para el limite de dias. */
export const allianceScore = (s: GameState, team: TeamId): number => allianceStanding(s, team).points;

/** Los puntos de la mejor alianza enemiga de `team` (0 si no tiene enemigos). */
export const rivalScore = (s: GameState, team: TeamId): number =>
  Math.max(0, ...enemiesOf(s, team).map((enemy) => allianceScore(s, enemy)));

/** Los equipos que aun no han perdido (ni su Base ni todo lo suyo, ni se han rendido). */
export const standingTeams = (s: GameState): TeamId[] => teamIds(s).filter((team) => !isDefeated(s, team));

/** Un equipo de cada alianza (el primero), en orden: para mirar lo de cada alianza una vez. */
function oneTeamPerAlliance(s: GameState, teams: readonly TeamId[]): TeamId[] {
  const seen = new Set<number>();
  return teams.filter((team) => {
    const alliance = teamState(s, team).alliance;
    if (seen.has(alliance)) return false;
    seen.add(alliance);
    return true;
  });
}

/**
 * La caida que decide la partida: la ultima apuntada de entre `losers`, no una de antes; si cayeron
 * varios a la vez, la de mas prioridad (perder la Base, quedarse sin nada, rendirse: mainFall). Solo
 * lee lo apuntado: una partida cambiada sin las INVARIANTS (que apuntan las caidas) es un fallo.
 */
function decidingFallAmong(s: GameState, losers: readonly TeamId[]): FallenTeam {
  const deciding = mainFall(lastFallen(s).filter(({ team }) => losers.includes(team)));
  if (!deciding) throw new Error('La partida se decide sin ninguna caida apuntada: se ha cambiado sin las INVARIANTS');
  return deciding;
}

/** Por que se decide la partida: por la caida que la decide (decidingFallAmong). */
const lossReason = (s: GameState, losers: readonly TeamId[]): EndReason => decidingFallAmong(s, losers).fall.reason;

/**
 * La caida que decidio una partida acabada por caidas (no por el limite de dias ni por el objetivo):
 * la misma que da su motivo, de entre los que no ganan. La usa el final para decir de quien fue.
 */
export function decidingFall(s: GameState, result: Exclude<MatchResult, { status: 'playing' }>): FallenTeam {
  const winners: readonly TeamId[] = result.winners;
  return decidingFallAmong(
    s,
    teamIds(s).filter((team) => !winners.includes(team)),
  );
}

/** Gana la alianza de `team` (todos sus equipos, tambien los que hayan caido), por `reason`. */
const allianceWins = (s: GameState, team: TeamId, reason: EndReason): MatchResult => ({
  status: 'decided',
  winners: alliesOf(s, team),
  reason,
});

const draw = (reason: EndReason): MatchResult => ({ status: 'draw', winners: [], reason });

const STILL_PLAYING: MatchResult = { status: 'playing', winners: [], reason: null };

/** Una forma de acabar la partida: el resultado, si ya lo decide (null: sigue). */
export interface VictoryRule {
  decide(s: GameState): MatchResult | null;
}

/**
 * Solo queda en pie una alianza: gana. Si caen las ultimas a la vez (se puede: un poder del general,
 * capturas en el mismo turno), empate. [CAMBIO] En 2013 perdia el jugador.
 */
function lastAllianceStanding(s: GameState): MatchResult | null {
  const standing = oneTeamPerAlliance(s, standingTeams(s));
  if (standing.length > 1) return null;
  const [survivor] = standing;
  if (survivor === undefined) return draw(lossReason(s, teamIds(s)));
  return allianceWins(s, survivor, lossReason(s, enemiesOf(s, survivor)));
}

/** El objetivo de la mision: si su dueño lo cumple, gana su alianza; si falla, todos sus enemigos. */
function missionObjective(s: GameState): MatchResult | null {
  // Conquistar la Base ('hq') nunca se cumple aqui: lo decide 'lastAllianceStanding'.
  const objective = s.mission?.objective;
  if (!objective) return null;
  switch (objectiveStatus(s, objective)) {
    case 'achieved':
      return allianceWins(s, objective.owner, 'objective');
    case 'failed':
      return { status: 'decided', winners: enemiesOf(s, objective.owner), reason: 'objective' };
    case 'pending':
      return null;
  }
}

/**
 * [CAMBIO] Limite de dias: al acabar el ultimo gana la alianza con mas puntos; si empata con la mejor,
 * la de mas edificios; si tambien, empate (en 2013 perdia el jugador, y la IA tambien).
 */
function dayLimit(s: GameState): MatchResult | null {
  if (!dayLimitReached(s)) return null;
  const standings = oneTeamPerAlliance(s, teamIds(s)).map((team) => ({ team, ...allianceStanding(s, team) }));
  const best = maxBy(standings, (standing) => [standing.points, standing.buildings]);
  if (!best) return draw('days');
  const isTied = standings.some((other) => other !== best && other.points === best.points && other.buildings === best.buildings);
  return isTied ? draw('days') : allianceWins(s, best.team, 'days');
}

/** Todas las formas de acabar (el tipo obliga a tener una por `VictoryRuleId`). */
export const VICTORY_RULES: { readonly [Id in VictoryRuleId]: VictoryRule } = {
  lastAllianceStanding: { decide: lastAllianceStanding },
  objective: { decide: missionObjective },
  dayLimit: { decide: dayLimit },
};

/**
 * Como va la partida: el de la primera forma de acabar de su modo que lo decide, o que sigue. Con 3 o
 * mas equipos, que caiga uno no la acaba: los demas siguen jugando.
 */
export function matchResult(s: GameState): MatchResult {
  for (const rule of gameModeOf(s).victory) {
    const result = VICTORY_RULES[rule].decide(s);
    if (result) return result;
  }
  return STILL_PLAYING;
}

/** La partida ha terminado (ver matchResult). */
export const isMatchOver = (s: GameState): boolean => matchResult(s).status !== 'playing';

/** El equipo esta entre los que ganan (su alianza ha ganado). */
export const isWinner = (result: MatchResult, team: TeamId): boolean => result.status === 'decided' && result.winners.includes(team);

/** Como ha acabado una partida para un equipo: ganada, perdida o empate. */
export type MatchOutcome = 'won' | 'lost' | 'draw';

/** Como ha acabado la partida (ya acabada) para `team`. */
export function outcomeFor(result: Exclude<MatchResult, { status: 'playing' }>, team: TeamId): MatchOutcome {
  if (result.status === 'draw') return 'draw';
  return isWinner(result, team) ? 'won' : 'lost';
}

/** Progreso del objetivo de la mision para su dueño, para enseñarlo (p. ej. "2/3 ciudades", "dia 4 de 8"). */
export function objectiveProgress(s: GameState): ObjectiveProgress | null {
  const objective = s.mission?.objective;
  return objective ? measureObjective(s, objective) : null;
}
