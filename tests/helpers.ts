import { entryOf, type BuildingType, type TerrainType, type UnitType } from '@core/content';
import { defaultContent } from '@core/content/default';
import { SAVE_VERSION } from '@core/saveVersion';
import { rulesWith } from '@core/rulesConfig';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import type { GameState, RulesConfig } from '@core/model';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/**
 * Una partida guardada que dice ser del formato 1 (`version: 1`): para probar que MIGRATIONS hace con
 * ella lo de entonces (los pasos de los tipos por numero dejan los ids como estan).
 */
export function savedByVersion1(json: string): string {
  return json.replace(`"version":${SAVE_VERSION}`, '"version":1');
}

/** Partida vacia toda de hierba, para tests de reglas: con las reglas de siempre y los cambios de `rules`. */
export function blankState(rules: Partial<RulesConfig> = {}): GameState {
  return newGameState({
    map: blankMap(BLANK_SIZE, defaultContent().plainTerrain.id),
    rules: rulesWith(defaultContent(), rules),
    content: defaultContent(),
    funds: [5000, 5000],
  });
}

/** Un tipo de unidad del contenido del juego, por su id ('Tank'). */
export const unitTypeNamed = (id: string): UnitType => entryOf(defaultContent().units, id, 'unidad');
/** Un tipo de edificio del contenido del juego, por su id ('City'). */
export const buildingTypeNamed = (id: string): BuildingType => entryOf(defaultContent().buildings, id, 'edificio');
/** Un terreno del contenido del juego, por su id ('Woods'). */
export const terrainNamed = (id: string): TerrainType => entryOf(defaultContent().terrain, id, 'terreno');

/** El id del cuartel general del contenido del juego (lo que guarda `Building.type`). */
export const hqId = (): string => defaultContent().hq.id;
