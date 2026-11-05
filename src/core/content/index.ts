/**
 * Contenido del juego en ficheros de configuracion (src/core/content/*.json): unidades, edificios,
 * terreno, clima, reglas por defecto y pesos de la IA. Ver docs/CONTENIDO.md.
 *
 * Cada parte tiene su modulo con `validate*` y `build*` (units.ts, buildings.ts...); aqui solo se
 * leen los ficheros, se validan todos juntos (para dar todos los errores a la vez) y se construyen las
 * tablas. `loadContent` da el resultado, un GameContent congelado, que cada partida lleva en
 * `GameState.content` (se lee con tablesOf(s): ver gameContent.ts).
 *
 * El ORDEN de las listas de unidades y edificios es el numero de tipo que guardan las partidas: las
 * nuevas van siempre al final, nunca en medio, y no se borran.
 */
import { deepFreeze, mutableCopy, type DeepReadonly } from '../util/freeze';
import aiFile from './ai.json';
import buildingsFile from './buildings.json';
import generalsFile from './generals.json';
import rulesFile from './rules.json';
import terrainFile from './terrain.json';
import unitsFile from './units.json';
import weatherFile from './weather.json';
import { validateAi } from './ai';
import { validateBuildings } from './buildings';
import { Checker, uniqueIds } from './check';
import { validateGenerals, type GeneralDef } from './generals';
import { validateRules } from './rules';
import { buildTables, contentContext, type Content, type ContentTables } from './tables';
import { validateTerrain } from './terrain';
import { TERRAIN_NAMES, type BuildingDef, type TerrainDef, type UnitDef } from './types';
import { validateUnits } from './units';
import { validateWeather, type WeatherDef } from './weather';

export * from './types';
export { buildTables, type Content, type ContentTables } from './tables';
export { moveCostFor, walkableFor } from './movement';
export type { AiWeights } from './ai';
export type { WeatherDef } from './weather';
export type { GeneralAbilityDef, GeneralDef, GeneralEffect, GeneralModifier, UnitFilter } from './generals';

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
export function validateContent(files: Content): string[] {
  const check = new Checker();
  const lists = { units: files.units, buildings: files.buildings, terrain: files.terrain };
  for (const [name, list] of Object.entries(lists)) if (!Array.isArray(list)) return [`${name}.json: tiene que tener una lista "${name}"`];
  const context = contentContext(uniqueIds(check, 'unidad', files.units), uniqueIds(check, 'edificio', files.buildings));
  validateUnits(files.units, context, check);
  validateBuildings(files.buildings, context, check);
  validateTerrain(files.terrain, TERRAIN_NAMES, check);
  validateRules(files.rules, check);
  validateAi(files.ai, check);
  validateWeather(files.weather, check);
  validateGenerals(files.generals, context.unitIds, check);
  return check.errors;
}

/**
 * El contenido de una partida: los ficheros tal cual (nombres, notas, generales...) y sus tablas. Son
 * datos (se pueden pasar como JSON a otro hilo) y estan congelados: nadie los cambia mientras se juega.
 * Cada partida lleva el suyo (ver core/gameContent.ts).
 */
export interface GameContent {
  readonly files: DeepReadonly<Content>;
  readonly tables: ContentTables;
}

declare module '../model/state' {
  /** El contenido de una partida (`GameState.content`) es un GameContent. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- solo le da su forma
  interface MatchContent extends GameContent {}
}

/** Lee, valida y convierte el contenido (congelado). Si algo esta mal, lanza un error que dice que. */
export function loadContent(source: DeepReadonly<Content>): GameContent {
  // Una copia propia: quien la da puede seguir cambiando la suya.
  const files = mutableCopy<Content>(source);
  const errors = validateContent(files);
  if (errors.length) throw new Error(`Contenido del juego no valido (src/core/content):\n- ${errors.join('\n- ')}`);
  return deepFreeze({ files, tables: buildTables(files) });
}
