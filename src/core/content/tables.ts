/**
 * Lo que hay en los ficheros de contenido (`Content`) y las tablas por numero de tipo que se
 * construyen con ellos (`buildTables`, `ContentTables`). Lo usan index.ts (cargar el contenido) y
 * movement.ts; aparte para que no dependan uno del otro.
 */
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

/** Tablas que usan las reglas. El contenido tiene que estar validado. */
export function buildTables(c: Content) {
  const ctx: ContentContext = {
    unitIds: new Set(c.units.map((u) => u.id)),
    buildingIds: new Set(c.buildings.map((b) => b.id)),
    terrainNames: TERRAIN_NAMES,
  };
  return {
    ...buildUnitTables(
      c.units,
      ctx,
      c.buildings.map((b) => b.id),
    ),
    ...buildBuildingTables(c.buildings, ctx),
    ...buildTerrainTables(c.terrain),
    DEFAULT_RULES: { ...c.rules.defaults },
    MAX_FUNDS: c.rules.maxFunds,
    AI: buildAiWeights(c.ai),
    ...buildWeatherTables(c.weather),
  };
}

/** Las tablas que usan las reglas, construidas a partir de los ficheros. */
export type ContentTables = ReturnType<typeof buildTables>;
