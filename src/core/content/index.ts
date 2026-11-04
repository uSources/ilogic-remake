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
import { deepFreeze } from '../util/freeze';
import aiFile from './ai.json';
import buildingsFile from './buildings.json';
import generalsFile from './generals.json';
import rulesFile from './rules.json';
import terrainFile from './terrain.json';
import unitsFile from './units.json';
import weatherFile from './weather.json';
import { buildAiWeights, validateAi } from './ai';
import { buildBuildingTables, validateBuildings } from './buildings';
import { Checker, uniqueIds } from './check';
import { validateGenerals, type GeneralDef } from './generals';
import { validateRules, type RulesFile } from './rules';
import { buildTerrainTables, validateTerrain } from './terrain';
import { TERRAIN_NAMES, type BuildingDef, type ContentContext, type TerrainDef, type UnitDef } from './types';
import { buildUnitTables, validateUnits } from './units';
import { buildWeatherTables, validateWeather, type WeatherDef } from './weather';

export * from './types';
export { moveCostFor, walkableFor } from './movement';
export type { AiWeights } from './ai';
export type { WeatherDef } from './weather';
export type { GeneralAbilityDef, GeneralDef, GeneralEffect, GeneralModifier, UnitFilter } from './generals';

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

/** Lee los ficheros JSON del juego (sin validar). */
export function readContentFiles(): Content {
  return {
    units: (unitsFile as unknown as { units: UnitDef[] }).units,
    buildings: (buildingsFile as unknown as { buildings: BuildingDef[] }).buildings,
    terrain: (terrainFile as unknown as { terrain: TerrainDef[] }).terrain,
    rules: rulesFile,
    ai: aiFile,
    weather: (weatherFile as unknown as { weather: WeatherDef[] }).weather,
    generals: (generalsFile as unknown as { generals: GeneralDef[] }).generals,
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
  validateGenerals(c.generals, ctx.unitIds, check);
  return check.errors;
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

/**
 * El contenido de una partida: los ficheros tal cual (nombres, notas, generales...) y sus tablas. Son
 * datos (se pueden pasar como JSON a otro hilo) y estan congelados: nadie los cambia mientras se juega.
 * Cada partida lleva el suyo (ver core/gameContent.ts).
 */
export interface GameContent {
  readonly files: Content;
  readonly tables: ContentTables;
}

declare module '../model/state' {
  /** El contenido de una partida (`GameState.content`) es un GameContent. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- solo le da su forma
  interface MatchContent extends GameContent {}
}

/** Lee, valida y convierte el contenido (congelado). Si algo esta mal, lanza un error que dice que. */
export function loadContent(c: Content): GameContent {
  const errs = validateContent(c);
  if (errs.length) throw new Error(`Contenido del juego no valido (src/core/content):\n- ${errs.join('\n- ')}`);
  return deepFreeze({ files: structuredClone(c), tables: buildTables(c) });
}
