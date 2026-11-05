/**
 * Victoria y derrota: Base, limite de dias, puntos y objetivos de mision.
 */

import { unitTypeOf, isHq } from '../gameContent';
import { AI_TEAM, PLAYER } from '../util/predicates';
import type { Building, GameState, Objective, Outcome, Pos, Team } from '../model';

/** Puntos que vale cada edificio para el limite de dias. */
const BUILDING_SCORE = 1000;

const hasHQ = (s: GameState, team: Team): boolean => s.buildings.some((building) => building.owner === team && isHq(s, building));

const buildingsOf = (s: GameState, team: Team): Building[] => s.buildings.filter((building) => building.owner === team);

function defeated(s: GameState, team: Team): boolean {
  const hasAnything = s.units.some((unit) => unit.team === team) || buildingsOf(s, team).length > 0;
  return !hasHQ(s, team) || !hasAnything;
}

/**
 * Puntos de un bando para el limite de dias: valor de su ejercito (coste x vida/100)
 * mas 1000 por cada edificio.
 */
export function score(s: GameState, team: Team): number {
  let total = 0;
  for (const unit of s.units) if (unit.team === team) total += (unitTypeOf(s, unit).cost * unit.life) / 100;
  for (const building of s.buildings) if (building.owner === team) total += BUILDING_SCORE;
  return Math.round(total);
}

/** El limite de dias (si lo hay) ya se ha cumplido. */
export const dayLimitReached = (s: GameState): boolean => s.rules.dayLimit !== null && s.day > s.rules.dayLimit;

/** Al acabar el ultimo dia: mas puntos; si empatan, mas edificios; si tambien, pierde el jugador. */
function dayLimitOutcome(s: GameState): Outcome {
  const playerScore = score(s, PLAYER);
  const aiScore = score(s, AI_TEAM);
  if (playerScore !== aiScore) return playerScore > aiScore ? 'won' : 'lost';
  return buildingsOf(s, PLAYER).length > buildingsOf(s, AI_TEAM).length ? 'won' : 'lost';
}

/**
 * Se gana neutralizando la Base enemiga (o si el enemigo se queda sin nada). Si ambas, se pierde.
 * [CAMBIO] Con limite de dias, al acabar el ultimo gana quien tenga mas puntos (empate: mas edificios;
 * si tambien empatan, pierde el jugador).
 */
export function outcome(s: GameState): Outcome {
  if (defeated(s, PLAYER)) return 'lost';
  if (defeated(s, AI_TEAM)) return 'won';
  const objective = s.mission?.objective;
  if (objective && objective.kind !== 'hq') return objectiveOutcome(s, objective);
  if (dayLimitReached(s)) return dayLimitOutcome(s);
  return 'playing';
}

/** Edificios del jugador que cuentan para un objetivo de capturar. */
function capturedForObjective(s: GameState, objective: Extract<Objective, { kind: 'capture' }>): number {
  return buildingsOf(s, PLAYER).filter((building) => objective.type === null || building.type === objective.type).length;
}

const aiUnitCount = (s: GameState): number => s.units.filter((unit) => unit.team === AI_TEAM).length;

/** Donde esta la unidad escoltada: dentro de un transporte cuenta donde este el transporte. */
function escortPosition(s: GameState, uid: number): Pos | null {
  const escorted = s.units.find((unit) => unit.uid === uid);
  if (!escorted) return null;
  if (escorted.carrier === null) return escorted;
  return s.units.find((unit) => unit.uid === escorted.carrier) ?? escorted;
}

/** Resultado de una mision con objetivo especial (la derrota por perder la Base ya se ha mirado). */
function objectiveOutcome(s: GameState, objective: Exclude<Objective, { kind: 'hq' }>): Outcome {
  const isLate = s.day > objective.days;
  const wonOrWait = (isDone: boolean): Outcome => (isDone ? 'won' : isLate ? 'lost' : 'playing');
  switch (objective.kind) {
    case 'survive':
      return isLate ? 'won' : 'playing';
    case 'capture':
      return wonOrWait(capturedForObjective(s, objective) >= objective.count);
    case 'destroy':
      return wonOrWait(aiUnitCount(s) === 0);
    case 'escort': {
      const at = escortPosition(s, objective.uid);
      if (!at) return 'lost';
      return wonOrWait(at.x === objective.to.x && at.y === objective.to.y);
    }
  }
}

/** Progreso del objetivo de la mision, para enseñarlo (p. ej. "2/3 ciudades", "dia 4 de 8"). */
export function objectiveProgress(s: GameState): { done: number; total: number } | null {
  const objective = s.mission?.objective;
  if (!objective || objective.kind === 'hq') return null;
  switch (objective.kind) {
    case 'survive':
      return { done: Math.min(s.day - 1, objective.days), total: objective.days };
    case 'capture':
      return { done: capturedForObjective(s, objective), total: objective.count };
    case 'destroy':
      return { done: 0, total: aiUnitCount(s) };
    case 'escort':
      return null;
  }
}

/** Por que ha terminado la partida. */
export function endReason(s: GameState): 'hq' | 'wipeout' | 'days' | 'objective' | null {
  const result = outcome(s);
  if (result === 'playing') return null;
  const loser: Team = result === 'won' ? AI_TEAM : PLAYER;
  if (!hasHQ(s, loser)) return 'hq';
  if (defeated(s, loser)) return 'wipeout';
  if (s.mission && s.mission.objective.kind !== 'hq') return 'objective';
  return 'days';
}
