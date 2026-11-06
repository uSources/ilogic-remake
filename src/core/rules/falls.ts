/**
 * Las caidas de los equipos: si un equipo ha caido y por que (`currentDefeat`, mirando la partida de
 * ahora) y cuando cayo (`TeamState.fell`, que apunta `recordFalls`: una de las INVARIANTS, asi que
 * se apunta en la accion o la ronda en que pasa, y al cargar una partida vieja). El final de la
 * partida (victory.ts) solo lee lo apuntado.
 */
import { isHq } from '../gameContent';
import { teamIds, teamState } from '../teams';
import type { DefeatReason, GameEvent, GameState, TeamFall, TeamId } from '../model';

/**
 * Por que puede caer un equipo, en el orden en que cuentan si caen varios a la vez: perder la Base,
 * quedarse sin nada, rendirse. La unica lista (el tipo, DefeatReason, esta en el modelo, que no
 * tiene constantes: el `satisfies` y `MissingReason` las atan).
 */
export const DEFEAT_REASONS = ['hq', 'wipeout', 'surrender'] as const satisfies readonly DefeatReason[];
type MissingReason = Exclude<DefeatReason, (typeof DEFEAT_REASONS)[number]>;
const ALL_REASONS_LISTED: [MissingReason] extends [never] ? true : never = true;
void ALL_REASONS_LISTED;

/** El motivo es uno de los de DEFEAT_REASONS (para lo que viene de fuera: partidas guardadas). */
export const isDefeatReason = (value: unknown): value is DefeatReason => (DEFEAT_REASONS as readonly unknown[]).includes(value);

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

/** Cuando y por que cayo el equipo, segun lo apuntado (null: sigue en pie). */
export const fallOf = (s: GameState, team: TeamId): TeamFall | null => teamState(s, team).fell;

/** Los equipos de la ultima caida apuntada (los que cayeron en la misma accion), o ninguno. */
export function lastFallen(s: GameState): TeamId[] {
  const last = Math.max(0, ...s.teams.map((team) => team.fell?.order ?? 0));
  return last === 0 ? [] : teamIds(s).filter((team) => fallOf(s, team)?.order === last);
}

/**
 * La invariante 'falls': apunta la caida de los equipos que acaban de caer (`TeamState.fell`, todos
 * con el mismo numero, el siguiente) y da su suceso ('teamDefeated', de `actor`: quien hizo la
 * accion; null al acabar la ronda o al cargar).
 */
export function recordFalls(s: GameState, actor: TeamId | null): GameEvent[] {
  const fallen = teamIds(s).filter((team) => fallOf(s, team) === null && isDefeated(s, team));
  if (!fallen.length) return [];
  const order = 1 + Math.max(0, ...s.teams.map((team) => team.fell?.order ?? 0));
  return fallen.map((team) => {
    const reason = currentDefeat(s, team)!;
    teamState(s, team).fell = { order, reason };
    return { kind: 'teamDefeated', actor, team, reason };
  });
}

/**
 * Lo apuntado cuadra con la partida (al cargarla): quien tiene caida apuntada ha caido de verdad, y
 * su motivo es rendirse si y solo si se ha rendido.
 */
export function fallsMatch(s: GameState): boolean {
  return teamIds(s).every((team) => {
    const fell = fallOf(s, team);
    if (fell === null) return true;
    return isDefeated(s, team) && (fell.reason === 'surrender') === teamState(s, team).resigned;
  });
}
