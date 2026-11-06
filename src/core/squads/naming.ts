/** [CAMBIO] Nombres y teclas de grupo (1-9) de las escuadras: que nombre y que tecla le toca a cada una. */
import type { GameState, Squad, TeamId } from '../model';

/** Nombres que se van dando a las escuadras nuevas (el jugador los puede cambiar). */
export const SQUAD_NAMES = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Eco', 'Fox', 'Golf', 'Hotel', 'India', 'Juliet'] as const;

/** Largo maximo del nombre de una escuadra. */
export const SQUAD_NAME_MAX = 14;

/** Nombre limpio: sin espacios de mas y como mucho SQUAD_NAME_MAX letras (null si queda vacio). */
export function cleanSquadName(name: string): string | null {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, SQUAD_NAME_MAX);
  return clean || null;
}

/** Teclas de grupo: 1-9, como en los juegos de estrategia en tiempo real. */
export const SQUAD_KEYS = 9;

/**
 * Primer nombre libre de la lista (o el de la tecla `key`, si esta libre: Ctrl+3 forma «Charlie»).
 * Si se han gastado todos, el primero con el numero de la escuadra.
 */
export function freeName(squads: readonly Squad[], id: number, key?: number): string {
  const used = new Set(squads.map((squad) => squad.name));
  const nameForKey = key !== undefined ? SQUAD_NAMES[key - 1] : undefined;
  if (nameForKey && !used.has(nameForKey)) return nameForKey;
  return SQUAD_NAMES.find((name) => !used.has(name)) ?? `${SQUAD_NAMES[0]} ${id}`;
}

/** Las escuadras de un equipo. */
export const squadsOfTeam = (s: GameState, team: TeamId): Squad[] => (s.squads ?? []).filter((squad) => squad.team === team);

/** La primera tecla de grupo (1-9) que no tiene ninguna de estas escuadras (las de un equipo). */
export function freeKey(squads: readonly Squad[]): number | undefined {
  const used = new Set(squads.map((squad) => squad.key));
  for (let key = 1; key <= SQUAD_KEYS; key++) if (!used.has(key)) return key;
  return undefined;
}

/** La escuadra del equipo con esa tecla de grupo. */
export function squadByKey(s: GameState, team: TeamId, key: number): Squad | undefined {
  return squadsOfTeam(s, team).find((squad) => squad.key === key);
}
