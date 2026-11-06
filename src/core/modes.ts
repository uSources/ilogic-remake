/**
 * Los modos de juego (`GameState.mode`): lo que cada uno fija de una partida y que no son reglas
 * sueltas. Una entrada por modo (el tipo obliga a tenerlas todas): como se acaba (`victory`, en
 * orden: la primera regla que decide, manda), en que orden juegan los equipos cada ronda
 * (`turnOrder`) y si la pantalla guarda sola al empezar el turno de una persona (`autosaves`).
 * Como se prepara cada uno (su mapa, sus equipos) esta en `MATCH_SETUPS` (core/match.ts), que
 * necesita el generador de mapas y las misiones; aqui solo lo que leen las reglas y la sesion.
 */
import type { GameModeId, TeamId, VictoryRuleId } from './model';

export interface GameMode {
  readonly id: GameModeId;
  /** Como se acaba la partida, en orden (ver VictoryRuleId). Sin ninguna, no se acaba sola. */
  readonly victory: readonly VictoryRuleId[];
  /** El orden de los turnos de cada ronda, dados los equipos en orden y el que empieza (si se pide uno). */
  turnOrder(teams: readonly TeamId[], first: TeamId | null): TeamId[];
  /** La pantalla guarda la partida sola al empezar el turno de una persona. */
  readonly autosaves: boolean;
}

/** Los equipos en su orden, empezando por `first` (si se pide) y siguiendo en el de la partida. */
function startingWith(teams: readonly TeamId[], first: TeamId | null): TeamId[] {
  const at = first === null ? 0 : teams.indexOf(first);
  if (at < 0) throw new Error(`El equipo ${first} no esta en la partida (hay ${teams.length})`);
  return [...teams.slice(at), ...teams.slice(0, at)];
}

export const GAME_MODES: { readonly [M in GameModeId]: GameMode & { readonly id: M } } = {
  skirmish: { id: 'skirmish', victory: ['lastAllianceStanding', 'dayLimit'], turnOrder: startingWith, autosaves: true },
  // El objetivo antes que el limite de dias: una mision de aguantar se gana al acabar sus dias.
  mission: { id: 'mission', victory: ['lastAllianceStanding', 'objective', 'dayLimit'], turnOrder: startingWith, autosaves: true },
  // Una partida preparada para ver algo (el laboratorio de animaciones): ni se acaba ni se guarda.
  sandbox: { id: 'sandbox', victory: [], turnOrder: startingWith, autosaves: false },
};

/** Los modos que hay (para lo que viene de fuera: partidas guardadas). */
export const isGameModeId = (value: unknown): value is GameModeId => typeof value === 'string' && Object.hasOwn(GAME_MODES, value);

/** El modo de la partida. */
export const gameModeOf = (s: { mode: GameModeId }): GameMode => GAME_MODES[s.mode];
