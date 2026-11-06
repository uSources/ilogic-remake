/**
 * Contenido del juego en ficheros de configuracion (src/core/content/*.json): unidades, edificios,
 * terreno, temas de mapa, generador de mapas, clima, generales, reglas por defecto y pesos de la IA.
 * Ver docs/CONTENIDO.md.
 *
 * Cada parte tiene su modulo con `validate*` y, si hace falta, `build*` (units.ts, buildings.ts...);
 * aqui solo se leen los ficheros, se validan todos juntos (para dar todos los errores a la vez) y se
 * resuelven los tipos (resolve.ts). `loadContent` da el resultado, un GameContent congelado, que
 * cada partida lleva en `GameState.content`.
 */
import { deepFreeze, mutableCopy, type DeepReadonly } from '../util/freeze';
import aiFile from './ai.json';
import buildingsFile from './buildings.json';
import generalsFile from './generals.json';
import mapgenFile from './mapgen.json';
import rulesFile from './rules.json';
import terrainFile from './terrain.json';
import themesFile from './themes.json';
import unitsFile from './units.json';
import weatherFile from './weather.json';
import { validateAi } from './ai';
import { validateBuildings } from './buildings';
import { Checker, uniqueIds } from './check';
import { validateGenerals, type GeneralDef } from './generals';
import { validateMapgen, type MapgenDef } from './mapgen';
import { resolveContent, type Content, type ResolvedContent } from './resolve';
import { validateRules } from './rules';
import { validateTerrain } from './terrain';
import { validateThemes, type ThemeDef } from './themes';
import type { BuildingDef, ContentContext, TerrainDef, UnitDef } from './types';
import { validateUnits } from './units';
import { validateWeather, type WeatherDef } from './weather';

export * from './types';
export { catalogOf, entryOf, findEntry, isEntryId, type Catalog, type Identified } from './catalog';
export type { Content } from './resolve';
export type { AiWeights } from './ai';
export type { BuildingType } from './buildings';
export type { MapgenDef, MapgenSettings } from './mapgen';
export type { TerrainType } from './terrain';
export type { TerrainChance, Theme, ThemeDef, ThemeGenerator } from './themes';
export type { UnitAttack, UnitType } from './units';
export { ABILITY_KINDS, ABILITY_SHAPES } from './abilities';
export type { WeatherDef, WeatherType } from './weather';
export type { GeneralPowerDef, GeneralDef, GeneralEffect, GeneralModifier, UnitFilter } from './generals';

/** Lee los ficheros JSON del juego (sin validar). */
export function readContentFiles(): Content {
  return {
    units: (unitsFile as unknown as { units: UnitDef[] }).units,
    buildings: (buildingsFile as unknown as { buildings: BuildingDef[] }).buildings,
    terrain: (terrainFile as unknown as { terrain: TerrainDef[] }).terrain,
    themes: (themesFile as unknown as { themes: ThemeDef[] }).themes,
    mapgen: mapgenFile as unknown as MapgenDef,
    rules: rulesFile,
    ai: aiFile,
    weather: (weatherFile as unknown as { weather: WeatherDef[] }).weather,
    generals: (generalsFile as unknown as { generals: GeneralDef[] }).generals,
  };
}

/** Las listas que tienen que estar para poder validar lo demas (las demas partes las nombran por id). */
const LISTS = ['units', 'buildings', 'terrain', 'themes'] as const;

function contextOf(files: Content, check: Checker): ContentContext {
  return {
    unitIds: uniqueIds(check, 'unidad', files.units),
    buildingIds: uniqueIds(check, 'edificio', files.buildings),
    terrainIds: uniqueIds(check, 'terreno', files.terrain),
    themeIds: uniqueIds(check, 'tema', files.themes),
  };
}

/** Comprueba todo el contenido y devuelve todos los errores (vacio si esta bien). */
export function validateContent(files: Content): string[] {
  const check = new Checker();
  for (const name of LISTS) if (!Array.isArray(files[name])) return [`${name}.json: tiene que tener una lista "${name}"`];
  const context = contextOf(files, check);
  validateUnits(files.units, context, check);
  validateBuildings(files.buildings, context, check);
  validateTerrain(files.terrain, check);
  validateThemes(files.themes, context.terrainIds, check);
  validateMapgen(files.mapgen, context, check);
  validateRules(files.rules, check);
  validateAi(files.ai, check);
  validateWeather(files.weather, context.themeIds, check);
  validateGenerals(files.generals, context.unitIds, check);
  return check.errors;
}

/**
 * El contenido de una partida: los ficheros tal cual (nombres, notas...) y sus tipos resueltos
 * (`units`, `buildings`, `terrain`, `themes`, `weather`, `generals`, por id con `entryOf`). Esta
 * congelado: nadie lo cambia mientras se juega. Cada partida lleva el suyo (ver core/gameContent.ts).
 */
export type GameContent = Readonly<ResolvedContent> & { readonly files: DeepReadonly<Content> };

declare module '../model/state' {
  /** El contenido de una partida (`GameState.content`) es un GameContent. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- solo le da su forma
  interface MatchContent extends GameContent {}
}

/** Lee, valida y resuelve el contenido (congelado). Si algo esta mal, lanza un error que dice que. */
export function loadContent(source: DeepReadonly<Content>): GameContent {
  // Una copia propia: quien la da puede seguir cambiando la suya.
  const files = mutableCopy<Content>(source);
  const errors = validateContent(files);
  if (errors.length) throw new Error(`Contenido del juego no valido (src/core/content):\n- ${errors.join('\n- ')}`);
  const content: GameContent = { files, ...resolveContent(files) };
  deepFreeze(content);
  return content;
}
