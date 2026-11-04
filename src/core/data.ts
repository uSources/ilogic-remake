// Constantes del juego que no son contenido: el generador de mapas del original (2013), tamaños y vida.
// Unidades, edificios, terreno, clima, generales y pesos de la IA NO estan aqui: son el contenido
// (src/core/content/*.json, ver docs/CONTENIDO.md), que cada partida lleva consigo (core/gameContent.ts).
// Correcciones respecto al original: fila 2 de PROBS_PER_ADJ (sobraba un valor).
import { MoveType, TERRAIN_NAMES, TerrainType, type AbilityDef } from './content';
import rulesFile from './content/rules.json';
import type { RulesConfig } from './model';

export { MoveType, TerrainType, TERRAIN_NAMES, type AbilityDef };

/** Numero de terrenos (lista fija: TERRAIN_NAMES). */
export const TERRAIN_TYPES = TERRAIN_NAMES.length;

// ---- Generador de mapas (RandomMap) ----
export { THEME_NAMES } from './content';
export const TILE_BASE_PROBS: readonly (readonly number[])[] = [
  [0.05, 0.005, 0.05, 0.0, 0.0, 0.0, 0.03, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.005, 0.0, 0.05, 0.03, 0.03, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.05, 0.005, 0.1, 0.0, 0.0, 0.0, 0.01, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.05, 0.03, 0.05, 0.0, 0.0, 0.0, 0.0, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.005, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.015, 0.02, 0.05, 0.0],
];
export const PROBS_PER_ADJ: readonly (readonly number[])[] = [
  [0.2, 0.3, 0.03, 0.0, 0.0, 0.0, 0.01, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.3, 0.0, 0.2, -0.05, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.1, 0.3, 0.15, 0.0, 0.0, 0.0, 0.005, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.05, 0.12, 0.02, 0.0, 0.0, 0.0, 0.0, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, -0.05, -0.05, 0.03, 0.0],
];
export const MAPGEN = {
  MINNB: 24,
  MAXNB: 30,
  MAXSPAWNDIST: 2,
  MINUCAP: 9,
  MINBCAP: 6,
  MINTILENUM: 200,
  MINNBS: [8, 5, 3, 3, 1, 0],
  MAXNBS: [11, 9, 5, 6, 3, 0],
  INITUS: [0, 0, 2],
  INITBS: [5, 0, 2, 1, 4],
  isSWater: [true, true, true, true, false],
  isIce: [false, false, false, false, true],
} as const;

// ---- Reglas generales ----
/** Tamaños de mapa admitidos en los mapas al azar (el tamaño de cada partida sale de su `map`). */
export const MAP_SIZES = [20, 32, 40] as const;
/** Tamaños admitidos en mapas hechos a mano (misiones, editor). */
export const MAP_MIN = 10,
  MAP_MAX = 48;
export const MAX_LIFE = 100;

/**
 * Reglas por defecto (rules.json, que valida loadContent), congeladas: cada partida lleva las suyas en
 * `s.rules`. [CAMBIO] El modo "reglas de 2013" se ha quitado.
 */
export const DEFAULT_RULES: Readonly<RulesConfig> = Object.freeze({ ...(rulesFile.defaults as RulesConfig) });

/** Las reglas de siempre con estos cambios: la unica forma de escribir unas reglas nuevas. */
export function rulesWith(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return { ...DEFAULT_RULES, ...overrides };
}
