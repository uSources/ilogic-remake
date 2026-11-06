/**
 * Los modos de juego (`GameState.mode`): lo que cada uno fija de una partida y que no son reglas
 * sueltas. Una entrada por modo (el tipo obliga a tenerlas todas): como se acaba (`victory`, en
 * orden: la primera regla que decide, manda), en que orden juegan los equipos cada ronda
 * (`turnOrder`), las reglas que el modo impone (`fixedRules`), sus pasos propios al empezar y
 * acabar cada turno (`turnPhases`, detras de los de todos) y si la sesion marca para guardar el
 * empezar del turno de una persona (`saves`). Como se prepara cada uno (su mapa, sus
 * equipos) esta en `MATCH_SETUPS` (core/match.ts), que necesita el generador de mapas y las
 * misiones; aqui solo lo que leen las reglas y la sesion.
 */
import type { ActionDispatcher } from './actions/types';
import { deepFreeze } from './util/freeze';
import type { GameEvent, GameModeId, GameState, RulesConfig, TeamId, VictoryRuleId } from './model';

/**
 * Un paso del principio o del final de un turno: lo que pasa solo por el equipo `team`, con sus
 * sucesos. Las acciones que haga las manda por `perform` (las mismas comprobaciones que dispatch).
 */
export interface TurnPhase {
  /** Nombre corto (para depurar). */
  readonly id: string;
  run(s: GameState, team: TeamId, perform: ActionDispatcher): GameEvent[];
}

export interface GameMode {
  readonly id: GameModeId;
  /** Como se acaba la partida, en orden (ver VictoryRuleId). Sin ninguna, no se acaba sola. */
  readonly victory: readonly VictoryRuleId[];
  /**
   * El orden de los turnos de cada ronda, dados los equipos en orden y el que empieza (si se pide
   * uno). Se fija al crear la partida y se guarda con ella (`GameState.turnOrder`): a proposito, una
   * partida guardada sigue con su orden aunque el modo cambie despues.
   */
  turnOrder(teams: readonly TeamId[], first: TeamId | null): TeamId[];
  /** Reglas que el modo impone, por encima de las que se elijan (buildMatch). */
  readonly fixedRules?: Partial<RulesConfig>;
  /** Pasos propios del modo al empezar y al acabar cada turno, detras de TURN_START_PHASES y TURN_END_PHASES. */
  readonly turnPhases?: { readonly start?: readonly TurnPhase[]; readonly end?: readonly TurnPhase[] };
  /**
   * La partida se guarda: a mano y, si quien juega lo tiene activado, sola al empezar el turno de una
   * persona (`isAutosaveMoment`, core/session). La partida para mirar, no (ni se ofrece guardarla).
   */
  readonly saves: boolean;
}

/** Los equipos en su orden, empezando por `first` (si se pide) y siguiendo en el de la partida. */
function startingWith(teams: readonly TeamId[], first: TeamId | null): TeamId[] {
  const at = first === null ? 0 : teams.indexOf(first);
  if (at < 0) throw new Error(`El equipo ${first} no esta en la partida (hay ${teams.length})`);
  return [...teams.slice(at), ...teams.slice(0, at)];
}

/** Congelados: un modo es lo que dice aqui, no se cambia en marcha (los tests que prueban otro lo dan con vi.mock de gameModeOf). */
export const GAME_MODES: { readonly [M in GameModeId]: GameMode & { readonly id: M } } = {
  skirmish: { id: 'skirmish', victory: ['lastAllianceStanding', 'dayLimit'], turnOrder: startingWith, saves: true },
  // El objetivo antes que el limite de dias: una mision de aguantar se gana al acabar sus dias.
  mission: {
    id: 'mission',
    victory: ['lastAllianceStanding', 'objective', 'dayLimit'],
    turnOrder: startingWith,
    saves: true,
  },
  // Una partida preparada para ver algo (el laboratorio de animaciones): ni se acaba ni se guarda, y
  // sin clima que cambie lo que se mira.
  sandbox: { id: 'sandbox', victory: [], turnOrder: startingWith, fixedRules: { weather: false }, saves: false },
};
deepFreeze(GAME_MODES);

/** Los modos que hay (para lo que viene de fuera: partidas guardadas). */
export const isGameModeId = (value: unknown): value is GameModeId => typeof value === 'string' && Object.hasOwn(GAME_MODES, value);

/**
 * La partida se puede perder: su modo tiene alguna forma de acabar. Sin ninguna (la partida para
 * mirar), rendirse no acabaria nada y no se ofrece.
 */
export const canBeLost = (mode: GameMode): boolean => mode.victory.length > 0;

/** El modo de la partida: la unica forma de leerlo (las reglas, la sesion y la preparacion). */
export const gameModeOf = (s: { readonly mode: GameModeId }): GameMode => GAME_MODES[s.mode];
