/**
 * Victoria y derrota: Base, limite de dias, puntos y objetivos de mision.
 */
import { HQ, RULES, UNIT } from '../data';
import type { GameState, Objective, Outcome, Team } from '../types';

function defeated(s: GameState, team: Team): boolean {
  const hasHQ = s.buildings.some((b) => b.owner === team && b.type === HQ);
  const hasAny = s.units.some((u) => u.team === team) || s.buildings.some((b) => b.owner === team);
  return !hasHQ || !hasAny;
}

/**
 * Puntos de un bando para el limite de dias: valor de su ejercito (coste x vida/100)
 * mas 1000 por cada edificio.
 */
export function score(s: GameState, team: Team): number {
  let v = 0;
  for (const u of s.units) if (u.team === team) v += (UNIT.cost[u.type]! * u.life) / 100;
  for (const b of s.buildings) if (b.owner === team) v += 1000;
  return Math.round(v);
}

/** El limite de dias (si lo hay) ya se ha cumplido. */
export const dayLimitReached = (s: GameState): boolean => RULES.dayLimit !== null && s.day > RULES.dayLimit;

/**
 * Se gana neutralizando la Base enemiga (o si el enemigo se queda sin nada). Si ambas, se pierde.
 * [CAMBIO] Con limite de dias, al acabar el ultimo gana quien tenga mas puntos (empate: mas edificios;
 * si tambien empatan, pierde el jugador).
 */
export function outcome(s: GameState): Outcome {
  if (defeated(s, 0)) return 'lost';
  if (defeated(s, 1)) return 'won';
  const obj = s.mission?.objective;
  if (obj && obj.kind !== 'hq') return objectiveOutcome(s, obj);
  if (dayLimitReached(s)) {
    const a = score(s, 0),
      b = score(s, 1);
    if (a !== b) return a > b ? 'won' : 'lost';
    const nb = (t: Team) => s.buildings.filter((x) => x.owner === t).length;
    return nb(0) > nb(1) ? 'won' : 'lost';
  }
  return 'playing';
}

/** Resultado de una mision con objetivo especial (la derrota por perder la Base ya se ha mirado). */
function objectiveOutcome(s: GameState, obj: Exclude<Objective, { kind: 'hq' }>): Outcome {
  const late = s.day > obj.days;
  switch (obj.kind) {
    case 'survive':
      return late ? 'won' : 'playing';
    case 'capture': {
      const n = s.buildings.filter((b) => b.owner === 0 && (obj.type === null || b.type === obj.type)).length;
      return n >= obj.count ? 'won' : late ? 'lost' : 'playing';
    }
    case 'destroy':
      return !s.units.some((u) => u.team === 1) ? 'won' : late ? 'lost' : 'playing';
    case 'escort': {
      const v = s.units.find((u) => u.uid === obj.uid);
      if (!v) return 'lost';
      // Dentro de un transporte cuenta donde este el transporte.
      const at = v.carrier !== null ? (s.units.find((u) => u.uid === v.carrier) ?? v) : v;
      return at.x === obj.to.x && at.y === obj.to.y ? 'won' : late ? 'lost' : 'playing';
    }
  }
}

/** Progreso del objetivo de la mision, para enseñarlo (p. ej. "2/3 ciudades", "dia 4 de 8"). */
export function objectiveProgress(s: GameState): { done: number; total: number } | null {
  const obj = s.mission?.objective;
  if (!obj || obj.kind === 'hq') return null;
  switch (obj.kind) {
    case 'survive':
      return { done: Math.min(s.day - 1, obj.days), total: obj.days };
    case 'capture':
      return { done: s.buildings.filter((b) => b.owner === 0 && (obj.type === null || b.type === obj.type)).length, total: obj.count };
    case 'destroy':
      return { done: 0, total: s.units.filter((u) => u.team === 1).length };
    case 'escort':
      return null;
  }
}

/** Por que ha terminado la partida. */
export function endReason(s: GameState): 'hq' | 'wipeout' | 'days' | 'objective' | null {
  if (outcome(s) === 'playing') return null;
  const loser: Team = outcome(s) === 'won' ? 1 : 0;
  if (!s.buildings.some((b) => b.owner === loser && b.type === HQ)) return 'hq';
  if (defeated(s, loser)) return 'wipeout';
  if (s.mission && s.mission.objective.kind !== 'hq') return 'objective';
  return 'days';
}
