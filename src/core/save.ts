/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 *
 * Leer es `readSave(json, contenido)`: solo lee partidas del formato de ahora (SAVE_VERSION; mientras
 * el juego no ha salido, las de antes se descartan, ver saveVersion.ts), las comprueba parte a parte
 * (savedParts.ts) y da la partida o el error que ha encontrado. No toca nada de fuera: ni el contenido
 * ni ninguna otra partida.
 */
import { savedPart } from './gameContent';
import { isEntryId, type GameContent } from './content';
import { fallsMatch } from './rules/falls';
import { SAVE_VERSION } from './saveVersion';
import {
  boardOf,
  cleanBuildings,
  cleanCounters,
  cleanOptionalParts,
  cleanUnits,
  hasConsistentCargo,
  hasGameShape,
  hasValidBuildings,
  hasValidUnits,
  isValidMap,
  isValidMission,
  hasValidTeams,
  cleanTeams,
  isValidTurn,
  type SaveFrame,
  type SavedGame,
  type SavedLists,
} from './savedParts';
import { GAME_MODES, isGameModeId, modeIn, type GameModeRegistry } from './modes';
import { isValidSettings } from './settingsSchema';
import { rulesetFor } from './ruleModules/registry';
import { isObject } from './util/validation';
import { isRandomState } from './util/random';
import type { GameState, SavedGameState } from './model';

export type { SavedGame } from './savedParts';

/** Por que no se ha podido leer una partida guardada. */
export type SaveError =
  | 'notJson'
  /** No es del formato de ahora (SAVE_VERSION): una de antes, o algo que no es una partida. */
  | 'badVersion'
  /** Le faltan las listas o las reglas. */
  | 'badShape'
  | 'badMap'
  | 'badTheme'
  | 'badDice'
  | 'badTeams'
  /** El modo de juego no existe. */
  | 'badMode'
  /** El orden de los turnos no es el de sus equipos, o le toca a quien no esta. */
  | 'badTurn'
  | 'badUnits'
  /** Un pasajero que no esta en su transporte, o al reves. */
  | 'badCargo'
  | 'badBuildings'
  | 'badMission'
  | 'badSettings';

/** Lo que da leer una partida guardada: la partida, o por que no se ha podido. */
export type ReadSaveResult = { ok: true; state: GameState } | { ok: false; error: SaveError };

/**
 * De donde viene lo que se lee: una partida guardada entera ('save'), o lo que sabe un equipo (una
 * vista con niebla que manda el servidor, 'view': core/net). Las caidas son publicas (la partida las
 * anuncia): en una vista van apuntadas y se leen tal cual, nunca se deducen de lo que se ve.
 */
export type SaveOrigin = 'save' | 'view';

export function serialize(s: GameState): string {
  return JSON.stringify(savedPart(s));
}

/** Como leer una partida: los modos que se conocen (si no, los del juego) y de donde viene. */
export interface ReadOptions {
  modes?: GameModeRegistry;
  origin?: SaveOrigin;
}

/** Lee una partida guardada (su JSON). El contenido con el que se juega no se guarda: lo da quien lee (`content`). */
export function readSave(json: string, content: GameContent, modes: GameModeRegistry = GAME_MODES): ReadSaveResult {
  return readSaved(parseJson(json), content, { modes });
}

/**
 * Lee una partida guardada ya convertida de JSON (`value`: cualquier cosa; lo que no sea un objeto
 * es 'notJson'). La limpia en sitio: quien quiera conservar lo que tenia, que pase una copia.
 */
export function readSaved(value: unknown, content: GameContent, { modes = GAME_MODES, origin = 'save' }: ReadOptions = {}): ReadSaveResult {
  if (!isObject(value) || Array.isArray(value)) return { ok: false, error: 'notJson' };
  const saved: SavedGame = value;
  if (saved.version !== SAVE_VERSION) return { ok: false, error: 'badVersion' };
  const check = checkGame(saved, content, modes);
  if (!check.ok) return check;
  const game = cleanGame(saved, check);
  const state: GameState = { ...game, content, ruleset: rulesetFor(modeIn(modes, game.mode), game.settings) };
  // Las caidas apuntadas tienen que cuadrar con la partida: quien ha caido tiene la suya, y solo el
  // (en una vista no se puede saber: lo que no se ve no esta).
  if (origin === 'save' && !fallsMatch(state)) return { ok: false, error: 'badTeams' };
  return { ok: true, state };
}

/** Lee una partida guardada (ver readSave): null si no se ha podido. */
export function deserialize(json: string, content: GameContent, modes: GameModeRegistry = GAME_MODES): GameState | null {
  const result = readSave(json, content, modes);
  return result.ok ? result.state : null;
}

/** Lo que hay en el JSON, o null si no es JSON (readSaved dice el resto). */
function parseJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

/** Lo que se sabe de una partida guardada que ha pasado las comprobaciones: sus listas y su marco. */
interface CheckedGame {
  ok: true;
  lists: SavedLists;
  frame: SaveFrame;
}

/**
 * Comprueba la partida parte a parte, en orden (cada una necesita las de antes: los equipos el
 * contenido, las unidades el mapa y los equipos...). Solo mira: el primer error, o lo que hace falta
 * para limpiarla (cleanGame).
 */
function checkGame(saved: SavedGame, content: GameContent, modes: GameModeRegistry): CheckedGame | { ok: false; error: SaveError } {
  const fail = (error: SaveError) => ({ ok: false as const, error });
  if (!hasGameShape(saved)) return fail('badShape');
  const { map, teams, units, buildings } = saved;
  if (!isValidMap(map, content)) return fail('badMap');
  if (!isEntryId(content.themes, saved.theme)) return fail('badTheme');
  if (!isRandomState(saved.dice) || !isRandomState(saved.decisionSeed)) return fail('badDice');
  if (!hasValidTeams(teams)) return fail('badTeams');
  if (!isGameModeId(saved.mode, modes)) return fail('badMode');
  const frame: SaveFrame = { content, board: boardOf(map), teamCount: teams.length };
  if (!isValidTurn(frame, saved)) return fail('badTurn');
  if (!hasValidUnits(frame, units)) return fail('badUnits');
  if (!hasConsistentCargo(units)) return fail('badCargo');
  if (!hasValidBuildings(frame, buildings)) return fail('badBuildings');
  if (saved.mission !== undefined && !isValidMission(frame, saved.mission)) return fail('badMission');
  if (!isValidSettings(saved.settings)) return fail('badSettings');
  return { ok: true, lists: { map, teams, units, buildings }, frame };
}

/** Lo opcional que este roto se arregla o se quita, en una partida que ya ha pasado checkGame. */
function cleanGame(saved: SavedGame, { lists, frame }: CheckedGame): SavedGameState {
  cleanTeams(frame.content, lists.teams);
  cleanUnits(frame, lists.units);
  cleanBuildings(frame, lists.buildings);
  cleanCounters(saved);
  cleanOptionalParts(frame, saved);
  // La unica afirmacion de tipo al leer: checkGame lo ha comprobado todo y lo opcional roto ya no
  // esta, pero TypeScript no puede seguir esas comprobaciones campo a campo por el JSON.
  return saved as unknown as SavedGameState;
}
