// Tablas de reglas del Ilogic original (2013), extraidas de docs/SPEC-REGLAS.md.
// Las unidades y los edificios NO estan aqui: viven en src/core/content/units.json y buildings.json
// (ver docs/CONTENIDO.md) y aqui se convierten en las tablas por indice de siempre.
// Correcciones respecto al original: tabla "poder" (filas 0, 8 y 17 desalineadas),
// fila 18 de "unitHeals" (faltaba) y fila 2 de PROBS_PER_ADJ (sobraba un valor).
import { loadContent } from './content';

export const TERRAIN_NAMES = [
  'Grass',
  'Water',
  'Woods',
  'Sand',
  'Cactus',
  'SandCliff',
  'Flowers',
  'GrassCliff',
  'SWater',
  'DWater',
  'Snow',
  'Frosty',
  'SnowCliff',
  'SnowWood',
  'Ice',
] as const;

const { content, tables: T } = loadContent(TERRAIN_NAMES);

/** Unidades y edificios tal y como estan en los JSON (nombres, notas, pistas para la IA...). */
export const CONTENT = content;

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
/** [unidad][edificio]: el edificio le da combustible (refueledAt) */
export const FUELER: readonly (readonly boolean[])[] = T.FUELER;
/** [unidad][edificio]: el edificio le da municion (rearmedAt) */
export const AMMO_RESTORER: readonly (readonly boolean[])[] = T.AMMO_RESTORER;
/** [unidad][edificio]: el edificio la fabrica (builtAt) */
export const SPAWNER: readonly (readonly boolean[])[] = T.SPAWNER;
/** [transporte][unidad]: puede llevarla (transport.carries) */
export const CAN_CARRY: readonly (readonly boolean[])[] = T.CAN_CARRY;
/** [unidad][unidad]: le da combustible (supplies.fuel) */
export const UNIT_FUELER: readonly (readonly boolean[])[] = T.UNIT_FUELER;
/** [unidad][unidad]: le da municion (supplies.ammo) */
export const UNIT_AMMO_RESTORER: readonly (readonly boolean[])[] = T.UNIT_AMMO_RESTORER;
/** [atacante][defensor]: probabilidad de acierto por punto de vida (attack.hitChance) */
export const POWER: number[][] = T.POWER;
/** [unidad][terreno]: prefijo de la imagen de 2013 (classicSprite) */
export const UNIT_TERRAIN_PREFIX: readonly (readonly string[])[] = T.UNIT_TERRAIN_PREFIX;
/** [unidad][unidad]: vida que le cura al estar al lado (heals) */
export const UNIT_HEALS: readonly (readonly number[])[] = T.UNIT_HEALS;
/** La IA la trata como apoyo (ai.support): no combate, compra como mucho una a la vez. */
export const UNIT_SUPPORT: readonly boolean[] = T.UNIT_SUPPORT;

export const BUILDING_NAMES: readonly string[] = T.BUILDING_NAMES;
export const BUILDING_TYPES = BUILDING_NAMES.length;
/** Cuartel general ("hq": true en buildings.json): si lo capturan, se pierde. */
export const HQ = T.HQ;
/** Ingresos, curacion, proteccion y vision por edificio (indice = BUILDING_NAMES). */
export const BUILDING = T.BUILDING;
export const BUILDING_TERRAIN_PREFIX: readonly (readonly string[])[] = T.BUILDING_TERRAIN_PREFIX;

export const TERRAIN_TYPES = TERRAIN_NAMES.length; // 15
export const TERRAIN = {
  /** Se puede construir encima (generador de mapas) */
  canbuild: [true, false, false, true, false, false, false, false, false, false, true, false, false, false, false],
  /** Es agua (orillas y generador). El hielo NO cuenta como agua. */
  iswater: [false, true, false, false, false, false, false, false, true, true, false, false, false, false, false],
  /** Multiplicador de la probabilidad de acierto contra la unidad que esta encima */
  protection: [1.0, 1.0, 0.85, 1.0, 0.9, 0.8, 1.0, 0.8, 1.0, 1.0, 1.0, 1.0, 0.8, 0.85, 1.0],
  /** [tipoMovimiento][terreno]: transitable */
  canwalk: [
    [true, false, true, true, true, true, true, true, true, false, true, true, true, true, true],
    [true, false, true, true, true, false, true, false, false, false, true, true, false, true, false],
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true, true],
    [true, true, true, true, true, false, true, false, true, true, true, true, false, true, false],
  ],
} as const;

/**
 * [CAMBIO] Coste de movimiento por tipo de movimiento y terreno (reglas nuevas; con las clasicas
 * todo cuesta 1). Solo cuenta en las casillas transitables (TERRAIN.canwalk).
 * Terrenos: Grass, Water, Woods, Sand, Cactus, SandCliff, Flowers, GrassCliff, SWater, DWater,
 *           Snow, Frosty, SnowCliff, SnowWood, Ice.
 */
export const MOVE_COST: number[][] = [
  // a pie: acantilados y agua poco profunda cuestan 2
  [1, 1, 1, 1, 1, 2, 1, 2, 2, 1, 1, 1, 2, 1, 1],
  // vehiculos: bosque, arena, cactus y nieve frenan
  [1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 2, 2, 1, 3, 1],
  // aereos: todo 1
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // anfibios: rapidos en agua y llanura, lentos en bosque y nieve
  [1, 1, 2, 2, 2, 1, 1, 1, 1, 2, 2, 2, 1, 3, 1],
];

/** Terrenos que esconden a quien esta dentro (con la regla forestHides): bosque, cactus, bosque nevado. */
export const HIDING_TERRAIN: readonly number[] = [2, 4, 13];

/** Indices de terreno usados por el codigo. */
export const T_GRASS = 0,
  T_WATER = 1,
  T_SNOW = 10,
  T_SWATER = 8,
  T_DWATER = 9,
  T_ICE = 14;

// ---- Generador de mapas (RandomMap) ----
export const THEME_NAMES = ['Plains', 'Desert', 'Forest', 'Swamp', 'Snowy'] as const;
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
/** Reglas y parametros de una partida (se guardan con ella). */
export interface RulesConfig {
  /** Dinero inicial de cada bando. */
  initialFunds: number;
  /** Unidades maximas por bando. */
  maxUnits: number;
  /** [CAMBIO] El defensor que sobrevive responde al ataque. */
  counterattack: boolean;
  /** null = tirada original por punto de vida; numero = daño esperado +- ese tanto por uno (0.1 = 10 %). */
  damageSpread: number | null;
  /** Puntos de captura de un edificio y de la Base. */
  capturePoints: number;
  hqCapturePoints: number;
  /** Multiplicador de los ingresos de los edificios. */
  incomeScale: number;
  /** Niebla de guerra. */
  fog: boolean;
  /** Limite de dias (null = sin limite): al acabar gana quien tenga mas puntos. */
  dayLimit: number | null;
  /** Veterania: las unidades que destruyen enemigos suben de rango (+acierto, +defensa). */
  veterancy: boolean;
  /** Se puede pasar por casillas de unidades propias (sin terminar en ellas). */
  passAllies: boolean;
  /** Emboscadas: el alcance no tiene en cuenta a los enemigos que no se ven; si el camino choca con uno, se para. */
  ambush: boolean;
  /** Con niebla, el bosque (y cactus, bosque nevado) solo se ve desde una casilla vecina. */
  forestHides: boolean;
  /** Cada terreno cuesta lo que diga MOVE_COST (si no, todo cuesta 1). */
  terrainCost: boolean;
}

/**
 * Reglas del juego. Los interruptores sirven a la herramienta de equilibrio para probar variantes.
 * [CAMBIO] El modo "reglas de 2013" se ha quitado (sin contraataque, captura al instante...).
 */
export const DEFAULT_RULES: Readonly<RulesConfig> = {
  initialFunds: 5000,
  maxUnits: 30,
  counterattack: true,
  damageSpread: 0.1,
  capturePoints: 20,
  hqCapturePoints: 30,
  incomeScale: 1,
  fog: true,
  dayLimit: null,
  veterancy: true,
  passAllies: true,
  ambush: true,
  forestHides: true,
  terrainCost: true,
};

/**
 * Reglas en uso. Las cambian la partida al empezar o cargarse (useRules) y las variantes
 * de la herramienta de equilibrio.
 */
export const RULES: RulesConfig = { ...DEFAULT_RULES };

export function useRules(r: Partial<RulesConfig>): void {
  Object.assign(RULES, DEFAULT_RULES, r);
  delete (RULES as Partial<RulesConfig> & { capture?: unknown }).capture;
}
export const MAX_FUNDS = 999999;
export const AI = {
  MAXMERGELIFE: 130,
  MAXCAPTDIST: 8,
  LIFETOBACK: 40,
  // [CAMBIO] Pesos de la IA nueva (antes sueltos en ai.ts). Cambiarlos cambia como juega:
  // comprobar con npm run balance y actualizar tests/aiGolden.test.ts.
  /** Precio que vale 1 punto de puntuacion al valorar un ataque (dano x precio/COSTSCALE). */
  COSTSCALE: 1000,
  /** Extra por matar al objetivo (por cada punto de precio/COSTSCALE). */
  KILLBONUS: 50,
  /** Extra por atacar a quien defiende su Base encima de ella. */
  HQDEFENDER: 200,
  /** Extra por echar a quien captura un edificio propio: la Base y el resto. */
  STOPCAPTUREHQ: 400,
  STOPCAPTURE: 60,
  /** Dano que da el extra completo (por debajo se reduce, nunca a menos de la mitad). */
  BONUSDAMAGE: 50,
  /** Preferencia al elegir edificio a capturar: Base enemiga y edificios con dueño. */
  CAPTUREHQ: 12,
  CAPTUREOWNED: 4,
  /** Unidades que capturan que intenta tener siempre. */
  MINCAPTURERS: 4,
  /** Vuelve a repostar si el combustible no da para FUELTURNS turnos mas un movimiento. */
  FUELTURNS: 3,
} as const;
