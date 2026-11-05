import { entryOf, type BuildingType, type TerrainType, type UnitType } from '@core/content';
import { defaultContent } from '@core/content/default';
import { keyOf } from '@core/gameContent';
import { rulesWith } from '@core/rulesConfig';
import { newGameState } from '@core/gameState';
import { blankMap } from '@core/mapGrid';
import type { GameState, RulesConfig } from '@core/model';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/** Partida vacia toda de hierba, para tests de reglas: con las reglas de siempre y los cambios de `rules`. */
/**
 * Una partida guardada como la guardaban las versiones de antes del formato 2 (`version: 1`): para
 * probar que MIGRATIONS las sigue leyendo.
 */
export function savedByVersion1(json: string): string {
  return json.replace('"version":2', '"version":1');
}

export function blankState(rules: Partial<RulesConfig> = {}): GameState {
  return newGameState({
    map: blankMap(BLANK_SIZE, terrainKey(defaultContent().plainTerrain)),
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

/** Lo que guarda una partida en `Building.type` para ese tipo (`buildingKey('City')`). */
export const buildingKey = (id: string): number => keyOf(defaultContent().buildings, buildingTypeNamed(id));
/** Lo que guarda una partida en `Building.type` para el cuartel general. */
export const hqKey = (): number => keyOf(defaultContent().buildings, defaultContent().hq);
/** Lo que guarda una partida en `map[x][y]` para ese terreno. */
export const terrainKey = (terrain: TerrainType): number => keyOf(defaultContent().terrain, terrain);
