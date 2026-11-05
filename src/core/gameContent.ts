/**
 * El contenido de cada partida (unidades, edificios, terreno, clima, generales, pesos de la IA). Es un
 * campo de la partida (`GameState.content`), no un modulo: dos partidas con contenidos distintos (el
 * del juego y el de una variante de equilibrio) se juegan a la vez en el mismo proceso.
 *
 * No se guarda (es el del juego, o el de la herramienta que la crea): `serialize` escribe solo lo
 * guardado (`SavedGameState`) y lo ponen quien crea la partida (`newGameState`) y quien la lee
 * (`deserialize`). Se lee como `s.content` o con los atajos de aqui, que dan el tipo resuelto de lo
 * que hay en la partida (`unitTypeOf(s, unit).cost`). Para copiar una partida, `cloneState` (comparte
 * el contenido, que esta congelado).
 */
import {
  entryOf,
  findEntry,
  type AiWeights,
  type BuildingType,
  type TerrainType,
  type Theme,
  type UnitType,
  type WeatherType,
} from './content';
import { mapGrid } from './mapGrid';
import type { Building, GameState, Pos, SavedGameState, Unit } from './model';

/** El tipo de una unidad, si el contenido de la partida lo tiene (para lo que viene de fuera). */
export function findUnitType(s: GameState, unit: Pick<Unit, 'type'>): UnitType | undefined {
  return findEntry(s.content.units, unit.type);
}

/** El tipo de un edificio, si el contenido de la partida lo tiene. */
export function findBuildingType(s: GameState, building: Pick<Building, 'type'>): BuildingType | undefined {
  return findEntry(s.content.buildings, building.type);
}

/** El tipo de una unidad (o de lo que lleve su tipo: una prevision, un evento). */
export const unitTypeOf = (s: GameState, unit: Pick<Unit, 'type'>): UnitType => entryOf(s.content.units, unit.type, 'unidad');

/** El tipo de un edificio. */
export const buildingTypeOf = (s: GameState, building: Pick<Building, 'type'>): BuildingType =>
  entryOf(s.content.buildings, building.type, 'edificio');

/** El edificio es el cuartel general (si lo capturan, su equipo pierde). */
export function isHq(s: GameState, building: Pick<Building, 'type'>): boolean {
  return buildingTypeOf(s, building).isHq;
}

/** El terreno de una casilla (tiene que estar dentro del mapa). */
export function terrainAt(s: GameState, pos: Pos): TerrainType {
  return entryOf(s.content.terrain, mapGrid(s).at(pos), 'terreno');
}

/** El tema del mapa de la partida. */
export function themeOf(s: GameState): Theme {
  return entryOf(s.content.themes, s.theme, 'tema');
}

/** Un clima de la partida por su id (WeatherState.kind y next). */
export function weatherTypeOf(s: GameState, kind: string): WeatherType {
  return entryOf(s.content.weather, kind, 'clima');
}

/** Los pesos de la IA de la partida (ai.json). */
export function weightsOf(s: GameState): Readonly<AiWeights> {
  return s.content.ai;
}

/** Lo que se guarda de la partida: todo menos el contenido. */
export function savedPart(s: GameState): SavedGameState {
  const { content: _content, ...saved } = s;
  return saved;
}

/** Copia de la partida: lo guardado se copia entero y el contenido (congelado) se comparte. */
export function cloneState(s: GameState): GameState {
  return { ...structuredClone(savedPart(s)), content: s.content };
}
