// Tablas de reglas del Ilogic original (2013), extraidas de docs/SPEC-REGLAS.md.
// Unidades, edificios, terreno, reglas por defecto y pesos de la IA NO estan aqui: viven en
// src/core/content/*.json (ver docs/CONTENIDO.md) y aqui se convierten en las tablas de siempre.
// Correcciones respecto al original: tabla "poder" (filas 0, 8 y 17 desalineadas),
// fila 18 de "unitHeals" (faltaba) y fila 2 de PROBS_PER_ADJ (sobraba un valor).
import { loadContent, MoveType, TERRAIN_NAMES, TerrainType, type AbilityDef, type RulesConfig } from './content';

export { MoveType, TerrainType, TERRAIN_NAMES, type AbilityDef, type RulesConfig };

const { content, tables: T } = loadContent();

/** Contenido tal y como esta en los JSON (nombres, notas, pistas para la IA...). */
export const CONTENT = content;
/** Generales (generals.json): ventaja fija, carga y habilidades. Reglas en core/generals.ts. */
export const GENERALS = content.generals;

/** Terrenos tal y como estan en terrain.json (nombres...). */
export const TERRAIN_CONTENT = content.terrain;

// ---- Unidades (units.json) ----

/** Nombres internos de las unidades; el indice es el numero de tipo (el que guardan las partidas). */
export const UNIT_NAMES: readonly string[] = T.UNIT_NAMES;
export const UNIT_TYPES = UNIT_NAMES.length;

/**
 * Estadisticas por tipo de unidad (indice = UNIT_NAMES). Se pueden cambiar en memoria (las variantes de
 * tools/balance lo hacen); para cambiarlas de verdad, units.json.
 */
export const UNIT = T.UNIT;

/** [unidad][edificio]: el edificio cura a la unidad (repairedAt) */
export const HEALER: readonly (readonly boolean[])[] = T.HEALER;
/** [unidad][edificio]: el edificio la fabrica (builtAt) */
export const SPAWNER: readonly (readonly boolean[])[] = T.SPAWNER;
/** [transporte][unidad]: puede llevarla (transport.carries) */
export const CAN_CARRY: readonly (readonly boolean[])[] = T.CAN_CARRY;
/** [atacante][defensor]: probabilidad de acierto por punto de vida (attack.hitChance) */
export const POWER: number[][] = T.POWER;
/** [unidad][terreno]: prefijo de la imagen de 2013 (classicSprite) */
export const UNIT_TERRAIN_PREFIX: readonly (readonly string[])[] = T.UNIT_TERRAIN_PREFIX;
/** [unidad][unidad]: vida que le cura con la orden de reparar, al lado (heals) */
export const UNIT_HEALS: readonly (readonly number[])[] = T.UNIT_HEALS;
/** La IA la trata como apoyo (ai.support): no combate, compra como mucho una a la vez. */
export const UNIT_SUPPORT: readonly boolean[] = T.UNIT_SUPPORT;
/** Nombre de las imagenes de cada unidad: el suyo o, mientras no tenga dibujo, el de `art`. */
export const UNIT_ART: readonly string[] = T.UNIT_ART;
/** [unidad]: habilidades (abilities); solo cuentan con la regla abilities. Ver core/abilities.ts. */
export const UNIT_ABILITIES = T.UNIT_ABILITIES;

// ---- Edificios (buildings.json) ----

export const BUILDING_NAMES: readonly string[] = T.BUILDING_NAMES;
export const BUILDING_TYPES = BUILDING_NAMES.length;
/** Cuartel general ("hq": true en buildings.json): si lo capturan, se pierde. */
export const HQ = T.HQ;
/** Ingresos, curacion, proteccion y vision por edificio (indice = BUILDING_NAMES). */
export const BUILDING = T.BUILDING;
export const BUILDING_TERRAIN_PREFIX: readonly (readonly string[])[] = T.BUILDING_TERRAIN_PREFIX;

// ---- Terreno (terrain.json) ----

export const TERRAIN_TYPES = TERRAIN_NAMES.length; // 15
/** Por terreno: se puede construir encima (generador), es agua, proteccion de quien esta encima. */
export const TERRAIN = T.TERRAIN;
/** Terrenos que esconden a quien esta dentro (con la regla forestHides): "hides" en terrain.json. */
export const HIDING_TERRAIN: readonly number[] = T.HIDING_TERRAIN;

/**
 * Movimiento: por donde pasa cada tipo (MoveType) y cuanto le cuesta cada terreno.
 *
 *   Movement.of(u.type)                    tipo de movimiento de una unidad
 *   Movement.canWalk(MoveType.VEHICLE, t)  se puede pasar
 *   Movement.cost(mt, TerrainType.WOODS)   coste de entrar (solo cuenta con la regla terrainCost)
 *
 * CAN_WALK y COST son las tablas [MoveType][terreno] (terrain.json, "movement"); se pueden cambiar en
 * memoria para probar variantes.
 */
export const Movement = {
  CAN_WALK: T.CAN_WALK,
  COST: T.MOVE_COST,
  of: (unitType: number): MoveType => UNIT.movtype[unitType]!,
  canWalk: (moveType: MoveType, terrain: number): boolean => Movement.CAN_WALK[moveType]?.[terrain] ?? false,
  cost: (moveType: MoveType, terrain: number): number => Movement.COST[moveType]?.[terrain] ?? 1,
};

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
/** Tamaño del mapa en casillas. 32x32 como el original; la pantalla de nueva partida permite otros. */
export let MAP_W = 32;
export let MAP_H = 32;
/** Tamaños de mapa admitidos. */
export const MAP_SIZES = [20, 32, 40] as const;
/** Tamaños admitidos en mapas hechos a mano (misiones, editor). */
export const MAP_MIN = 10,
  MAP_MAX = 48;
export function setMapSize(w: number, h: number = w): void {
  MAP_W = w;
  MAP_H = h;
}
export const MAX_LIFE = 100;

/** Reglas por defecto (rules.json). [CAMBIO] El modo "reglas de 2013" se ha quitado. */
export const DEFAULT_RULES: Readonly<RulesConfig> = T.DEFAULT_RULES;

/**
 * Reglas en uso. Las cambian la partida al empezar o cargarse (useRules) y las variantes
 * de la herramienta de equilibrio.
 */
export const RULES: RulesConfig = { ...DEFAULT_RULES };

export function useRules(r: Partial<RulesConfig>): void {
  Object.assign(RULES, DEFAULT_RULES, r);
  delete (RULES as Partial<RulesConfig> & { capture?: unknown }).capture;
}
/** Dinero maximo de un bando (rules.json). */
export const MAX_FUNDS = T.MAX_FUNDS;
/**
 * [CAMBIO] Pesos de la IA (ai.json). Cambiarlos cambia como juega: comprobar con npm run balance y
 * actualizar tests/aiGolden.test.ts.
 */
export const AI = T.AI;
/**
 * [CAMBIO] Climas (weather.json): la clase Climate de 2013, que no se usaba. Indice 0 = despejado.
 * WEATHER.move[clima][MoveType], WEATHER.chance[tema][clima]. Reglas en core/weather.ts.
 */
export const WEATHER = T.WEATHER;
export const WEATHER_TYPES = WEATHER.ids.length;
