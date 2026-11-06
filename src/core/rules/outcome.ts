/**
 * Victoria y derrota de cada equipo: Base, limite de dias, puntos y objetivo de la mision (este, en
 * objectives.ts). Todo se mide para un equipo: gana quien deja sin nada a todos sus enemigos.
 */

import { isHq } from '../gameContent';
import { armyValue } from '../stats';
import { measureObjective, objectiveOutcome, type ObjectiveProgress } from '../objectives';
import { alliesOf, areAllied, enemiesOf, teamState } from '../teams';
import { maxBy } from '../util/pick';
import type { Building, GameState, Outcome, TeamId } from '../model';

/** Puntos que vale cada edificio para el limite de dias. */
const BUILDING_SCORE = 1000;

const hasHQ = (s: GameState, team: TeamId): boolean => s.buildings.some((building) => building.owner === team && isHq(s, building));

const buildingsOf = (s: GameState, team: TeamId): Building[] => s.buildings.filter((building) => building.owner === team);

/** El equipo ha perdido su Base o se ha quedado sin unidades ni edificios. */
export function isDefeated(s: GameState, team: TeamId): boolean {
  const hasAnything = s.units.some((unit) => unit.team === team) || buildingsOf(s, team).length > 0;
  return !hasHQ(s, team) || !hasAnything;
}

/**
 * Puntos de un equipo para el limite de dias: valor de su ejercito (coste x vida/100)
 * mas 1000 por cada edificio.
 */
export function score(s: GameState, team: TeamId): number {
  return armyValue(s, team) + BUILDING_SCORE * buildingsOf(s, team).length;
}

/** El limite de dias (si lo hay) ya se ha cumplido. */
export const dayLimitReached = (s: GameState): boolean => s.rules.dayLimit !== null && s.day > s.rules.dayLimit;

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

/**
 * Al acabar el ultimo dia: gana la alianza con mas puntos; si empata con la mejor enemiga, la de mas
 * edificios; si tambien, pierde `team` (en 2013, el jugador).
 */
function dayLimitOutcome(s: GameState, team: TeamId): Outcome {
  const mine = allianceStanding(s, team);
  const rivals = enemiesOf(s, team).map((enemy) => allianceStanding(s, enemy));
  const best = maxBy(rivals, (rival) => [rival.points, rival.buildings]) ?? { points: -Infinity, buildings: -Infinity };
  if (mine.points !== best.points) return mine.points > best.points ? 'won' : 'lost';
  return mine.buildings > best.buildings ? 'won' : 'lost';
}

/** Resultado del objetivo de la mision para `team`: el de su dueño, o el contrario si es su enemigo. */
function missionOutcome(s: GameState, team: TeamId, mission: NonNullable<GameState['mission']>): Outcome {
  const forOwner = objectiveOutcome(s, mission.objective);
  if (areAllied(s, team, mission.objective.owner) || forOwner === 'playing') return forOwner;
  return forOwner === 'won' ? 'lost' : 'won';
}

/**
 * Como va la partida para `team`: pierde si se queda sin Base (o sin nada); gana si les pasa a todos
 * sus enemigos. Si las dos cosas, pierde. [CAMBIO] Con limite de dias, al acabar el ultimo gana la
 * alianza con mas puntos (empate: mas edificios; si tambien empatan, pierde).
 */
export function outcome(s: GameState, team: TeamId): Outcome {
  if (isDefeated(s, team)) return 'lost';
  if (enemiesOf(s, team).every((enemy) => isDefeated(s, enemy))) return 'won';
  if (s.mission && s.mission.objective.kind !== 'hq') return missionOutcome(s, team, s.mission);
  if (dayLimitReached(s)) return dayLimitOutcome(s, team);
  return 'playing';
}

/** Los equipos que aun no han perdido (ni su Base ni todo lo suyo). */
export const standingTeams = (s: GameState): TeamId[] => s.teams.filter((team) => !isDefeated(s, team.id)).map((team) => team.id);

/**
 * La partida ha terminado: solo queda en pie una alianza (o ninguna), o ya se ha decidido para los
 * que quedan (objetivo de la mision, limite de dias). Con 3 o mas equipos, que caiga uno no la acaba:
 * los demas siguen jugando.
 */
export function isMatchOver(s: GameState): boolean {
  const standing = standingTeams(s);
  const alliances = new Set(standing.map((team) => teamState(s, team).alliance));
  if (alliances.size <= 1) return true;
  return standing.some((team) => outcome(s, team) !== 'playing');
}

/** Progreso del objetivo de la mision para su equipo, para enseñarlo (p. ej. "2/3 ciudades", "dia 4 de 8"). */
export function objectiveProgress(s: GameState): ObjectiveProgress | null {
  const mission = s.mission;
  if (!mission || mission.objective.kind === 'hq') return null;
  return measureObjective(s, mission.objective);
}

/** Por que ha terminado la partida para `team` (null si sigue). */
export function endReason(s: GameState, team: TeamId): 'hq' | 'wipeout' | 'days' | 'objective' | null {
  const result = outcome(s, team);
  if (result === 'playing') return null;
  const losers = result === 'lost' ? [team] : enemiesOf(s, team);
  if (losers.some((loser) => !hasHQ(s, loser))) return 'hq';
  if (losers.some((loser) => isDefeated(s, loser))) return 'wipeout';
  if (s.mission && s.mission.objective.kind !== 'hq') return 'objective';
  return 'days';
}
