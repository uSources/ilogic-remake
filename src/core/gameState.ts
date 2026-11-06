/**
 * Crear una partida vacia: el unico sitio que escribe la forma de un GameState nuevo. La usan el
 * generador de mapas, las misiones, el laboratorio, las herramientas y los tests.
 */
import type { GameContent } from './content';
import { gameModeOf } from './modes';
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
  /** Semilla de los dados de la partida (`GameState.dice`, ver core/dice.ts): quien la crea dice cual. */
  diceSeed: number;
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
    dice: options.diceSeed >>> 0,
    // Una copia: quien crea la partida puede seguir usando las suyas sin cambiar las de esta.
    settings: { ...settings },
    content: options.content,
  };
}
