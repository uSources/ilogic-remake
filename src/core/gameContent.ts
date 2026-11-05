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
import type { AiWeights, BuildingType, Catalog, Identified, TerrainType, Theme, UnitType, WeatherType } from './content';
import type { Building, GameState, Pos, SavedGameState, Unit } from './model';

/** El tipo de una unidad, si el contenido de la partida lo tiene (para lo que viene de fuera). */
export function findUnitType(s: GameState, unit: Pick<Unit, 'type'>): UnitType | undefined {
  return s.content.units.list[unit.type];
}

/** El tipo de un edificio, si el contenido de la partida lo tiene. */
export function findBuildingType(s: GameState, building: Pick<Building, 'type'>): BuildingType | undefined {
  return s.content.buildings.list[building.type];
}

/** El tipo de una unidad (o de lo que lleve su tipo: una prevision, un evento). */
export function unitTypeOf(s: GameState, unit: Pick<Unit, 'type'>): UnitType {
  const unitType = findUnitType(s, unit);
  if (!unitType) throw new Error(`Tipo de unidad ${unit.type} desconocido en el contenido de la partida`);
  return unitType;
}

/** El tipo de un edificio. */
export function buildingTypeOf(s: GameState, building: Pick<Building, 'type'>): BuildingType {
  const buildingType = findBuildingType(s, building);
  if (!buildingType) throw new Error(`Tipo de edificio ${building.type} desconocido en el contenido de la partida`);
  return buildingType;
}

/** El edificio es el cuartel general (si lo capturan, su equipo pierde). */
export function isHq(s: GameState, building: Pick<Building, 'type'>): boolean {
  return buildingTypeOf(s, building).isHq;
}

/** El terreno de una casilla (tiene que estar dentro del mapa). */
export function terrainAt(s: GameState, pos: Pos): TerrainType {
  return s.content.terrain.list[s.map[pos.x]![pos.y]!]!;
}

/** El tema del mapa de la partida. */
export function themeOf(s: GameState): Theme {
  return s.content.themes.list[s.theme]!;
}

/** Un clima de la partida por su clave guardada (WeatherState.kind y next). */
export function weatherTypeOf(s: GameState, kind: number): WeatherType {
  return s.content.weather.list[kind]!;
}

/** La clave con la que la partida guarda un tipo de su contenido (en Unit.type, Building.type...). */
export function keyOf<T extends Identified>(catalog: Catalog<T>, entry: T): number {
  return catalog.list.indexOf(entry);
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
