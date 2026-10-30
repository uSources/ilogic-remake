/**
 * Contenido del juego en ficheros de configuracion (src/core/content/*.json): unidades, edificios,
 * terreno, clima, reglas por defecto y pesos de la IA. Ver docs/CONTENIDO.md.
 *
 * Cada parte tiene su modulo con `validate*` y `build*` (units.ts, buildings.ts...); aqui solo se
 * leen los ficheros, se validan todos juntos (para dar todos los errores a la vez) y se construyen las
 * tablas que reexporta data.ts.
 *
 * El ORDEN de las listas de unidades y edificios es el numero de tipo que guardan las partidas: las
 * nuevas van siempre al final, nunca en medio, y no se borran.
 */
import aiFile from './ai.json';
import buildingsFile from './buildings.json';
import rulesFile from './rules.json';
import terrainFile from './terrain.json';
import unitsFile from './units.json';
import weatherFile from './weather.json';
import { buildAiWeights, validateAi } from './ai';
import { buildBuildingTables, validateBuildings } from './buildings';
import { Checker, uniqueIds } from './check';
import { validateRules, type RulesFile } from './rules';
import { buildTerrainTables, validateTerrain } from './terrain';
import { TERRAIN_NAMES, type BuildingDef, type ContentContext, type TerrainDef, type UnitDef } from './types';
import { buildUnitTables, validateUnits } from './units';
import { buildWeatherTables, validateWeather, type WeatherDef } from './weather';

export * from './types';
export type { RulesConfig } from './rules';
export type { AiWeights } from './ai';
export type { WeatherDef } from './weather';

/** El contenido tal y como esta en los ficheros. */
export interface Content {
  units: UnitDef[];
  buildings: BuildingDef[];
  terrain: TerrainDef[];
  rules: RulesFile;
  ai: Record<string, unknown>;
  weather: WeatherDef[];
}

/** Lee los ficheros JSON del juego (sin validar). */
export function readContentFiles(): Content {
  return {
    units: (unitsFile as unknown as { units: UnitDef[] }).units,
    buildings: (buildingsFile as unknown as { buildings: BuildingDef[] }).buildings,
    terrain: (terrainFile as unknown as { terrain: TerrainDef[] }).terrain,
    rules: rulesFile,
    ai: aiFile,
    weather: (weatherFile as unknown as { weather: WeatherDef[] }).weather,
  };
}

/** Comprueba todo el contenido y devuelve todos los errores (vacio si esta bien). */
export function validateContent(c: Content): string[] {
  const check = new Checker();
  const lists = { units: c.units, buildings: c.buildings, terrain: c.terrain };
  for (const [name, list] of Object.entries(lists)) if (!Array.isArray(list)) return [`${name}.json: tiene que tener una lista "${name}"`];
  const ctx: ContentContext = {
    unitIds: uniqueIds(check, 'unidad', c.units),
    buildingIds: uniqueIds(check, 'edificio', c.buildings),
    terrainNames: TERRAIN_NAMES,
  };
  validateUnits(c.units, ctx, check);
  validateBuildings(c.buildings, ctx, check);
  validateTerrain(c.terrain, TERRAIN_NAMES, check);
  validateRules(c.rules, check);
  validateAi(c.ai, check);
  validateWeather(c.weather, check);
  return check.errors;
}

/** Tablas que usan las reglas (las de data.ts). El contenido tiene que estar validado. */
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

/** Lee, valida y convierte el contenido. Si algo esta mal, el juego no arranca y dice que. */
export function loadContent(c: Content = readContentFiles()) {
  const errs = validateContent(c);
  if (errs.length) throw new Error(`Contenido del juego no valido (src/core/content):\n- ${errs.join('\n- ')}`);
  return { content: c, tables: buildTables(c) };
}
