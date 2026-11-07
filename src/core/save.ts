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
import { isGameModeId } from './modes';
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

export function serialize(s: GameState): string {
  return JSON.stringify(savedPart(s));
}

/** Lee una partida guardada. El contenido con el que se juega no se guarda: lo da quien lee (`content`). */
export function readSave(json: string, content: GameContent): ReadSaveResult {
  const saved = parseObject(json);
  if (!saved) return { ok: false, error: 'notJson' };
  if (saved.version !== SAVE_VERSION) return { ok: false, error: 'badVersion' };
  const check = checkGame(saved, content);
  if (!check.ok) return check;
  const game = cleanGame(saved, check);
  const state: GameState = { ...game, content, ruleset: rulesetFor(game, game.settings) };
  // Las caidas apuntadas tienen que cuadrar con la partida: quien ha caido tiene la suya, y solo el.
  if (!fallsMatch(state)) return { ok: false, error: 'badTeams' };
  return { ok: true, state };
}

/** Lee una partida guardada (ver readSave): null si no se ha podido. */
export function deserialize(json: string, content: GameContent): GameState | null {
  const result = readSave(json, content);
  return result.ok ? result.state : null;
}

/** El JSON, si es un objeto (sin comprobar nada mas). */
function parseObject(json: string): SavedGame | null {
  try {
    const raw: unknown = JSON.parse(json);
    return isObject(raw) && !Array.isArray(raw) ? raw : null;
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
function checkGame(saved: SavedGame, content: GameContent): CheckedGame | { ok: false; error: SaveError } {
  const fail = (error: SaveError) => ({ ok: false as const, error });
  if (!hasGameShape(saved)) return fail('badShape');
  const { map, teams, units, buildings } = saved;
  if (!isValidMap(map, content)) return fail('badMap');
  if (!isEntryId(content.themes, saved.theme)) return fail('badTheme');
  if (!isRandomState(saved.dice) || !isRandomState(saved.decisionSeed)) return fail('badDice');
  if (!hasValidTeams(teams)) return fail('badTeams');
  if (!isGameModeId(saved.mode)) return fail('badMode');
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
