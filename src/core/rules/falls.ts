/**
 * Las caidas de los equipos: si un equipo ha caido y por que (`currentDefeat`, mirando la partida de
 * ahora) y cuando cayo (`TeamState.fell`, que apunta `recordFalls`: una de las INVARIANTS, asi que se
 * apunta en la accion o la ronda en que pasa). El final de la partida (victory.ts) solo lee lo
 * apuntado.
 */
import { isHq } from '../gameContent';
import { teamIds, teamState } from '../teams';
import type { DefeatReason, GameEvent, GameState, TeamFall, TeamId } from '../model';

/**
 * Por que puede caer un equipo y en que orden cuenta si caen varios a la vez (el menor, primero):
 * perder la Base, quedarse sin nada, rendirse. El tipo obliga a tener todos los motivos.
 */
const DEFEAT_PRIORITY: { readonly [Reason in DefeatReason]: number } = { hq: 0, wipeout: 1, surrender: 2 };

/** El motivo es uno de los de caer (para lo que viene de fuera, y para separarlo de 'days' u 'objective'). */
export const isDefeatReason = (value: unknown): value is DefeatReason => typeof value === 'string' && Object.hasOwn(DEFEAT_PRIORITY, value);

/** De entre estas caidas, la que cuenta (la de motivo de mas prioridad), o null si no hay ninguna. */
export function mainFall<T extends { fall: TeamFall }>(falls: readonly T[]): T | null {
  return falls.reduce<T | null>(
    (best, fall) => (best && DEFEAT_PRIORITY[best.fall.reason] <= DEFEAT_PRIORITY[fall.fall.reason] ? best : fall),
    null,
  );
}

/**
 * Si el equipo ha caido ahora y por que (null: sigue en pie): se ha rendido, se ha quedado sin nada
 * (ni unidades ni edificios: tampoco Base) o sin su Base.
 */
export function currentDefeat(s: GameState, team: TeamId): DefeatReason | null {
  if (teamState(s, team).resigned) return 'surrender';
  const hasAnything = s.units.some((unit) => unit.team === team) || s.buildings.some((building) => building.owner === team);
  if (!hasAnything) return 'wipeout';
  return s.buildings.some((building) => building.owner === team && isHq(s, building)) ? null : 'hq';
}

/** El equipo ha perdido su Base, se ha quedado sin unidades ni edificios o se ha rendido. */
export const isDefeated = (s: GameState, team: TeamId): boolean => currentDefeat(s, team) !== null;

/**
 * Todos los equipos de una partida nueva empiezan en pie (con su Base): uno que empezara caido no
 * tendria su caida apuntada (la apuntan las INVARIANTS al pasar), y es un fallo de su preparacion,
 * no algo que arreglar en silencio. Lo mira buildMatch (las misiones, ademas, ya lo comprueba
 * checkMission: missingBases).
 */
export function assertAllStanding(s: GameState): void {
  for (const team of teamIds(s)) {
    const defeat = currentDefeat(s, team);
    if (defeat) throw new Error(`La partida empieza con el equipo ${team} ya caido (${defeat}): cada equipo necesita su Base`);
  }
}

/** Cuando y por que cayo el equipo, segun lo apuntado (null: sigue en pie). */
export const fallOf = (s: GameState, team: TeamId): TeamFall | null => teamState(s, team).fell;

/** Un equipo con su caida apuntada. */
export interface FallenTeam {
  team: TeamId;
  fall: TeamFall;
}

/** Los equipos con caida apuntada despues de la caida `order` (0: todas). */
export const fallenSince = (s: GameState, order: number): FallenTeam[] =>
  teamIds(s).flatMap((team) => {
    const fall = fallOf(s, team);
    return fall && fall.order > order ? [{ team, fall }] : [];
  });

/** El numero de la ultima caida apuntada (0 si no ha caido nadie). */
export const lastFallOrder = (s: GameState): number => Math.max(0, ...s.teams.map((team) => team.fell?.order ?? 0));

/** Los equipos de la ultima caida apuntada (los que cayeron en la misma accion), con su caida. */
export const lastFallen = (s: GameState): FallenTeam[] => fallenSince(s, lastFallOrder(s) - 1);

/**
 * La invariante 'falls': apunta la caida de los equipos que acaban de caer (`TeamState.fell`, todos
 * con el mismo numero, el siguiente) y da su suceso ('teamDefeated', de `actor`: quien hizo la
 * accion; null al acabar la ronda).
 */
export function recordFalls(s: GameState, actor: TeamId | null): GameEvent[] {
  const fallen = teamIds(s).flatMap((team) => {
    const reason = fallOf(s, team) === null ? currentDefeat(s, team) : null;
    return reason ? [{ team, reason }] : [];
  });
  const order = lastFallOrder(s) + 1;
  for (const { team, reason } of fallen) teamState(s, team).fell = { order, reason };
  return fallen.map(({ team, reason }) => ({ kind: 'teamDefeated', actor, team, reason }));
}

/**
 * Lo apuntado cuadra con la partida (al cargarla): tiene caida apuntada quien ha caido, y solo el;
 * y su motivo es rendirse si y solo si se ha rendido.
 */
export function fallsMatch(s: GameState): boolean {
  return teamIds(s).every((team) => {
    const fell = fallOf(s, team);
    if (fell === null) return !isDefeated(s, team);
    return isDefeated(s, team) && (fell.reason === 'surrender') === teamState(s, team).resigned;
  });
}
