/**
 * Lo que hay en los ficheros de contenido (`Content`) y los tipos resueltos que salen de ellos
 * (`ResolvedContent`): cada unidad, edificio, terreno, clima, tema y general como un objeto con sus
 * campos con nombre, en un catalogo por id. Lo usa index.ts (cargar el contenido); aparte para que
 * los modulos de cada parte no dependan de el.
 */
import type { MatchSettings } from '../model';
import type { DeepReadonly } from '../util/freeze';
import { buildAiWeights, type AiWeights } from './ai';
import { buildBuildingTypes, type BuildingType } from './buildings';
import { catalogOf, type Catalog } from './catalog';
import type { GeneralDef } from './generals';
import type { MapgenDef, MapgenSettings } from './mapgen';
import type { RulesFile } from './rules';
import { buildTerrainTypes, type TerrainType } from './terrain';
import type { Theme, ThemeDef } from './themes';
import type { BuildingDef, TerrainDef, UnitDef } from './types';
import { buildUnitTypes, type UnitType } from './units';
import { buildWeatherTypes, type WeatherDef, type WeatherType } from './weather';

/** El contenido tal y como esta en los ficheros. */
export interface Content {
  units: UnitDef[];
  buildings: BuildingDef[];
  terrain: TerrainDef[];
  themes: ThemeDef[];
  mapgen: MapgenDef;
  rules: RulesFile;
  ai: Record<string, unknown>;
  weather: WeatherDef[];
  generals: GeneralDef[];
}

/** El contenido resuelto (recien construido: luego se congela). Los ficheros tienen que estar validados. */
export interface ResolvedContent {
  units: Catalog<UnitType>;
  buildings: Catalog<BuildingType>;
  /** El cuartel general (el edificio con "hq": true; hay exactamente uno). */
  hq: BuildingType;
  terrain: Catalog<TerrainType>;
  /** El suelo llano (el de "plain": true en terrain.json): el de los mapas vacios (laboratorio, duelos, pruebas). */
  plainTerrain: TerrainType;
  themes: Catalog<Theme>;
  mapgen: MapgenSettings;
  weather: Catalog<WeatherType>;
  /** El clima neutro (el de "clear": true en weather.json): con el empiezan las partidas. */
  clearWeather: WeatherType;
  generals: Catalog<DeepReadonly<GeneralDef>>;
  /** Reglas por defecto de una partida (rules.json, "defaults"): ver rulesWith. */
  defaultRules: Readonly<MatchSettings>;
  /** Dinero maximo de un equipo. */
  maxFunds: number;
  /** Pesos de la IA (ai.json). */
  ai: Readonly<AiWeights>;
}

export function resolveContent(files: Content): ResolvedContent {
  const buildings = catalogOf(buildBuildingTypes(files.buildings));
  const weather = catalogOf(buildWeatherTypes(files.weather));
  const terrain = catalogOf(buildTerrainTypes(files.terrain));
  return {
    units: catalogOf(buildUnitTypes(files.units)),
    buildings,
    hq: buildings.list.find((building) => building.isHq)!,
    terrain,
    plainTerrain: terrain.list.find((type) => type.isPlain)!,
    themes: catalogOf(files.themes),
    mapgen: files.mapgen,
    weather,
    clearWeather: weather.list.find((type) => type.isClear)!,
    generals: catalogOf(files.generals),
    defaultRules: { ...files.rules.defaults },
    maxFunds: files.rules.maxFunds,
    ai: buildAiWeights(files.ai),
  };
}
