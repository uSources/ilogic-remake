/**
 * Lo que hay en los ficheros de contenido (`Content`) y las tablas por numero de tipo que se
 * construyen con ellos (`buildTables`, `ContentTables`). Lo usan index.ts (cargar el contenido) y
 * movement.ts; aparte para que no dependan uno del otro.
 */
import type { DeepReadonly } from '../util/freeze';
import { buildAiWeights } from './ai';
import { buildBuildingTables } from './buildings';
import type { GeneralDef } from './generals';
import type { RulesFile } from './rules';
import { buildTerrainTables } from './terrain';
import { TERRAIN_NAMES, type BuildingDef, type ContentContext, type TerrainDef, type UnitDef } from './types';
import { buildUnitTables } from './units';
import { buildWeatherTables, type WeatherDef } from './weather';

/** El contenido tal y como esta en los ficheros. */
export interface Content {
  units: UnitDef[];
  buildings: BuildingDef[];
  terrain: TerrainDef[];
  rules: RulesFile;
  ai: Record<string, unknown>;
  weather: WeatherDef[];
  generals: GeneralDef[];
}

/** Lo que necesitan saber las partes del contenido de las demas: ids de unidades y edificios y terrenos. */
export function contentContext(unitIds: Set<string>, buildingIds: Set<string>): ContentContext {
  return { unitIds, buildingIds, terrainNames: TERRAIN_NAMES };
}

/** Tablas que usan las reglas (recien construidas: luego se congelan). El contenido tiene que estar validado. */
export function buildTables(files: Content) {
  const ctx = contentContext(new Set(files.units.map((unit) => unit.id)), new Set(files.buildings.map((building) => building.id)));
  return {
    ...buildUnitTables(
      files.units,
      ctx,
      files.buildings.map((building) => building.id),
    ),
    ...buildBuildingTables(files.buildings, ctx),
    ...buildTerrainTables(files.terrain),
    DEFAULT_RULES: { ...files.rules.defaults },
    MAX_FUNDS: files.rules.maxFunds,
    AI: buildAiWeights(files.ai),
    ...buildWeatherTables(files.weather),
  };
}

/** Las tablas que usan las reglas, construidas a partir de los ficheros, de solo lectura (estan congeladas). */
export type ContentTables = DeepReadonly<ReturnType<typeof buildTables>>;
