/**
 * Crear una partida vacia: el unico sitio que escribe la forma de un GameState nuevo. La usan el
 * generador de mapas, las misiones, el laboratorio, las herramientas y los tests.
 */
import type { GameContent } from './content';
import { gameModeOf } from './modes';
import { rulesetFor } from './ruleModules/registry';
import type { MatchSeeds } from './util/random';
import { SAVE_VERSION } from './saveVersion';
import { newTeams, type TeamSetup } from './teams';
import type { GameModeId, GameState, MatchSettings, TeamId } from './model';

/** Lo que hace falta para empezar una partida: su mapa y sus reglas (el resto sale de ellas). */
export interface NewGameStateOptions {
  /** Terreno `map[x][y]` (ids de terrain.json): su tamaño es el de la partida. */
  map: GameState['map'];
  settings: Readonly<MatchSettings>;
  /** Contenido con el que se juega (unidades, edificios, terreno...): `defaultContent()` o una variante. */
  content: GameContent;
  /** El modo de juego (core/modes.ts): como se acaba y en que orden se juegan los turnos. */
  mode: GameModeId;
  /** Tema del mapa (id de themes.json; si no, el primero). */
  theme?: string;
  /** Los equipos, en orden (quien los juega, su alianza y su dinero): no hay equipos por defecto. */
  teams: readonly TeamSetup[];
  /** El equipo que juega primero cada ronda (si no, el primero de la lista; el orden lo dice el modo). */
  firstTeam?: TeamId;
  /**
   * Las semillas de su azar, una aparte de la otra (`MatchSeeds`): la de los dados (`GameState.dice`,
   * ver core/dice.ts) y la de las decisiones de la IA (`GameState.decisionSeed`). Quien la crea dice cuales.
   */
  seeds: MatchSeeds;
}

/** Partida sin unidades ni edificios, en el dia 1, con su contenido; el primer equipo aun no ha empezado su turno. */
export function newGameState(options: NewGameStateOptions): GameState {
  const { map, settings } = options;
  const teams = newTeams(options.teams, settings.initialFunds);
  const turnOrder = gameModeOf(options).turnOrder(
    teams.map((team) => team.id),
    options.firstTeam ?? null,
  );
  return {
    version: SAVE_VERSION,
    map,
    theme: options.theme ?? options.content.themes.list[0]!.id,
    teams,
    units: [],
    buildings: [],
    nextUid: 1,
    nextSquadId: 1,
    day: 1,
    mode: options.mode,
    turnOrder,
    turn: turnOrder[0]!,
    turnStarted: false,
    dice: options.seeds.dice >>> 0,
    decisionSeed: options.seeds.decisions >>> 0,
    // Una copia: quien crea la partida puede seguir usando las suyas sin cambiar las de esta.
    settings: { ...settings },
    content: options.content,
    ruleset: rulesetFor(options, settings),
  };
}

/**
 * Cambia los ajustes de una partida ya creada (lo que impone un modo, un laboratorio, una prueba):
 * los ajustes y los modulos de reglas que salen de ellos, a la vez, para que no se separen. El unico
 * sitio que los cambia despues de crearla.
 */
export function changeSettings(s: GameState, settings: Readonly<MatchSettings>): void {
  Object.assign(s, { settings: { ...settings }, ruleset: rulesetFor(s, settings) });
}
