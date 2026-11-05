/**
 * Guardar y cargar partidas como JSON (en el original, formato binario en data/save).
 * [CAMBIO] sin comprobacion de "gameid" (el original cerraba el juego si no coincidia)
 * y sin modificar el estado al guardar.
 *
 * Leer es `readSave(json, contexto)`: pone al dia el JSON (MIGRATIONS), lo comprueba parte a parte
 * (savedParts.ts) y da la partida o el error que ha encontrado. No toca nada de fuera: ni el contenido
 * ni ninguna otra partida.
 */
import { savedPart } from './gameContent';
import { isEntryId, type GameContent } from './content';
import { migrateChecked, migrateRead, type SaveContext } from './saveMigrations';
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
  isValidTeamList,
  type SaveFrame,
  type SavedGame,
} from './savedParts';
import { isValidRules } from './rulesSchema';
import { isInt, isObject } from './util/validation';
import { isRandomState } from './util/random';
import type { GameState, SavedGameState } from './model';

export type { SaveContext } from './saveMigrations';
export type { SavedGame } from './savedParts';

/** Por que no se ha podido leer una partida guardada. */
export type SaveError =
  | 'notJson'
  | 'unknownVersion'
  /** Le faltan las listas o las reglas. */
  | 'badShape'
  | 'badMap'
  | 'badTheme'
  | 'badDice'
  | 'badTeams'
  | 'badUnits'
  /** Un pasajero que no esta en su transporte, o al reves. */
  | 'badCargo'
  | 'badBuildings'
  | 'badMission'
  | 'badRules';

/** Lo que da leer una partida guardada: la partida, o por que no se ha podido. */
export type ReadSaveResult = { ok: true; state: GameState } | { ok: false; error: SaveError };

export function serialize(s: GameState): string {
  return JSON.stringify(savedPart(s));
}

/**
 * Lee una partida guardada. Lo que no se guarda lo da `context`: el contenido con el que se juega y
 * las reglas de las misiones. Antes de comprobarla le aplica los pasos para partidas antiguas
 * (MIGRATIONS, en saveMigrations.ts).
 */
export function readSave(json: string, context: SaveContext): ReadSaveResult {
  const saved = parseObject(json);
  if (!saved) return { ok: false, error: 'notJson' };
  const version = saved.version;
  if (!isInt(version, 1, SAVE_VERSION)) return { ok: false, error: 'unknownVersion' };
  migrateRead(saved, version, context);
  saved.version = SAVE_VERSION;
  const error = gameProblem(saved, context.content);
  if (error) return { ok: false, error };
  assertCheckedGame(saved, error);
  // El contenido es el de quien lee.
  const state: GameState = { ...saved, content: context.content };
  migrateChecked(state, version, context);
  return { ok: true, state };
}

/** Lee una partida guardada (ver readSave): null si no se ha podido. */
export function deserialize(json: string, context: SaveContext): GameState | null {
  const result = readSave(json, context);
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

/**
 * Comprueba la partida parte a parte, en orden (cada una necesita las de antes: los equipos el
 * contenido, las unidades el mapa y los equipos...), y limpia lo opcional que este roto. Devuelve el
 * primer error, o null si esta bien.
 */
function gameProblem(saved: SavedGame, content: GameContent): SaveError | null {
  if (!hasGameShape(saved)) return 'badShape';
  const { map, teams, units, buildings } = saved;
  if (!isValidMap(map, content)) return 'badMap';
  if (!isEntryId(content.themes, saved.theme)) return 'badTheme';
  if (!isRandomState(saved.dice)) return 'badDice';
  if (!isValidTeamList(teams, content)) return 'badTeams';
  const frame: SaveFrame = { content, board: boardOf(map), teamCount: teams.length };
  if (!hasValidUnits(frame, units)) return 'badUnits';
  if (!hasConsistentCargo(units)) return 'badCargo';
  if (!hasValidBuildings(frame, buildings)) return 'badBuildings';
  if (saved.mission !== undefined && !isValidMission(frame, saved.mission)) return 'badMission';
  if (!isValidRules(saved.rules)) return 'badRules';
  // Todo lo que tiene que estar, esta: lo opcional que este roto se arregla o se quita.
  cleanUnits(frame, units);
  cleanBuildings(frame, buildings);
  cleanCounters(saved);
  cleanOptionalParts(frame, saved);
  return null;
}

/**
 * Una partida que ha pasado `gameProblem` sin problema (comprobada y limpia) tiene la forma de
 * `SavedGameState`: lo dice el tipo aqui, una vez. Si no, es un fallo de quien llama.
 */
function assertCheckedGame(_saved: SavedGame, problem: SaveError | null): asserts _saved is SavedGame & SavedGameState {
  if (problem !== null) throw new Error(`La partida no ha pasado las comprobaciones (${problem})`);
}
