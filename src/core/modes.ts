/**
 * Los modos de juego (`GameState.mode`): lo que cada uno fija de una partida y que no son reglas
 * sueltas. Una entrada por modo (el tipo obliga a tenerlas todas): como se acaba (`victory`, en
 * orden: la primera regla que decide, manda), en que orden juegan los equipos cada ronda
 * (`turnOrder`), las reglas que el modo impone (`fixedSettings`), sus pasos propios al empezar y
 * acabar cada turno (`turnPhases`, detras de los de todos) y si la partida se guarda (`saves`: a
 * mano y, si quien juega quiere, sola al empezar el turno de una persona). Como se prepara cada uno (su mapa, sus
 * equipos) esta en `MATCH_SETUPS` (core/match.ts), que necesita el generador de mapas y las
 * misiones; aqui solo lo que leen las reglas y la sesion.
 */
import { deepFreeze } from './util/freeze';
import type { RuleModule } from './ruleModules/hooks';
import type { ActionDispatcher, GameEvent, GameModeId, GameState, MatchSettings, TeamId, VictoryRuleId } from './model';

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
  /** Ajustes que el modo impone, por encima de los que se elijan (buildMatch). */
  readonly fixedSettings?: Partial<MatchSettings>;
  /** Modulos de reglas propios del modo, ademas de los del juego (RULE_MODULES); se enchufan igual, con su `isOn`. */
  readonly ruleModules?: readonly RuleModule[];
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

/**
 * Los modos que conoce quien crea o lee una partida, por su nombre. Las partidas resuelven el suyo al
 * crearse o leerse (como sus modulos de reglas: `s.ruleset.mode`), asi que otro registro (un modo
 * nuevo, uno de prueba, el de un servidor) se juega sin cambiar nada global: se le da a
 * `newGameState`, a `buildMatch` (`MatchSetupContext.modes`) o a `readSave`.
 */
export type GameModeRegistry = { readonly [M in GameModeId]?: GameMode & { readonly id: M } };

/** Los modos del juego (congelados: un modo es lo que dice aqui, no se cambia en marcha). */
export const GAME_MODES = {
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
  sandbox: { id: 'sandbox', victory: [], turnOrder: startingWith, fixedSettings: { weather: false }, saves: false },
} as const satisfies GameModeRegistry;
deepFreeze(GAME_MODES);

/** El valor es el nombre de uno de los modos de `modes` (para lo que viene de fuera: partidas guardadas). */
export const isGameModeId = (value: unknown, modes: GameModeRegistry = GAME_MODES): value is GameModeId =>
  typeof value === 'string' && Object.hasOwn(modes, value);

/** El modo con ese nombre en `modes`. Uno que no esta es un fallo de quien crea la partida. */
export function modeIn(modes: GameModeRegistry, id: GameModeId): GameMode {
  const mode = modes[id];
  if (!mode) throw new Error(`El modo de juego "${id}" no esta en los que se conocen`);
  return mode;
}

/**
 * La partida se puede perder: su modo tiene alguna forma de acabar. Sin ninguna (la partida para
 * mirar), rendirse no acabaria nada y no se ofrece.
 */
export const canBeLost = (mode: GameMode): boolean => mode.victory.length > 0;

/** El modo de la partida (el que se resolvio al crearla o leerla): la unica forma de leerlo (las reglas, la sesion y la preparacion). */
export const gameModeOf = (s: GameState): GameMode => s.ruleset.mode;
