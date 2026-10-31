/** Tipos y nombres comunes del contenido del juego (sin logica). */

/** Texto en los dos idiomas del juego. */
export interface Texts {
  es: string;
  en: string;
}

/** Tipos de movimiento: el numero es el indice de las tablas (Movement.CAN_WALK[tipo][terreno]). */
export const MoveType = { FOOT: 0, VEHICLE: 1, AIR: 2, AMPHIBIOUS: 3 } as const;
export type MoveType = (typeof MoveType)[keyof typeof MoveType];

/** Nombre de cada tipo de movimiento en los JSON, en el orden de MoveType. */
export const MOVEMENTS = ['foot', 'vehicle', 'air', 'amphibious'] as const;
export type MovementName = (typeof MOVEMENTS)[number];

/**
 * Terrenos. Lista fija: el numero es el que guardan mapas y partidas, y lo usan el arte, el generador
 * de mapas y las misiones. terrain.json solo cambia sus numeros.
 */
/** Temas de mapa (el numero es GameState.theme): cambian el generador, las orillas y el clima. */
export const THEME_NAMES = ['Plains', 'Desert', 'Forest', 'Swamp', 'Snowy'] as const;

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

export const TerrainType = {
  GRASS: 0,
  WATER: 1,
  WOODS: 2,
  SAND: 3,
  CACTUS: 4,
  SAND_CLIFF: 5,
  FLOWERS: 6,
  GRASS_CLIFF: 7,
  SHALLOW_WATER: 8,
  DEEP_WATER: 9,
  SNOW: 10,
  FROSTY: 11,
  SNOW_CLIFF: 12,
  SNOW_WOOD: 13,
  ICE: 14,
} as const;
export type TerrainType = (typeof TerrainType)[keyof typeof TerrainType];

/** Clases de habilidad que entiende el juego. Cada una tiene sus numeros en el JSON. */
export const ABILITY_KINDS = ['guard', 'zoneOfControl', 'aura', 'piercing', 'scout', 'quickCapture'] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

/**
 * Habilidad pasiva de una unidad (units.json, "abilities"). Siempre esta activa; no es una orden.
 * - guard: los ataques a distancia (alcance minimo > 1) contra ella aciertan `factor` veces (0.5 = la mitad).
 * - zoneOfControl: los enemigos con un movimiento de `stops` que entran en una casilla de al lado se
 *   tienen que parar ahi (pueden salir el turno siguiente). Solo cuenta si la ven.
 * - aura: a las unidades propias a `radius` casillas o menos les aciertan `defense` veces (no se suma
 *   con otras auras: cuenta la mejor). A ella misma no.
 * - piercing: ignora esa parte (0..1) de la proteccion del terreno y del edificio del objetivo.
 * - scout: ve lo que se esconde en el bosque (regla forestHides) en todo su radio de vision.
 * - quickCapture: multiplica lo que resta al capturar (1.5 = un 50 % mas rapido).
 */
export type AbilityDef =
  | { kind: 'guard'; factor: number }
  | { kind: 'zoneOfControl'; stops: MovementName[] }
  | { kind: 'aura'; radius: number; defense: number }
  | { kind: 'piercing'; ignoreCover: number }
  | { kind: 'scout' }
  | { kind: 'quickCapture'; factor: number };

export interface UnitDef {
  /** Nombre interno (en ingles, sin espacios). Las imagenes son u/b_<id>.png, u/r_<id>.png... */
  id: string;
  name: Texts;
  cost: number;
  /** Puntos de mando que ocupa (regla commandPoints): las unidades grandes pesan mas. */
  command: number;
  /** Casillas que puede mover por turno. */
  move: number;
  /** Radio de vision (rombo). */
  vision: number;
  movement: MovementName;
  captures: boolean;
  /**
   * null = no ataca. `range`: distancias desde/hasta (1 = casilla de al lado; [2, 5] = artilleria).
   * `hitChance`: probabilidad de acierto de cada punto de vida contra cada unidad (0..1; si no esta, 0).
   */
  attack: { range: [number, number]; hitChance: Record<string, number> } | null;
  transport?: { slots: number; carries: string[] };
  /** Edificios que la fabrican y edificios propios que la curan al empezar la ronda. */
  builtAt: string[];
  repairedAt: string[];
  /** Vida que cura a cada unidad propia de al lado con la orden de reparar (Suministros). */
  heals?: Record<string, number>;
  /** Mientras no tenga dibujo propio, se pinta con el de esta unidad. */
  art?: string;
  /** Graficos de 2013: prefijo de la imagen segun el terreno ("1_" en agua, "2_" en nieve). */
  classicSprite?: Record<string, string>;
  /** Habilidades pasivas (regla abilities): ver AbilityDef y docs/CONTENIDO.md. */
  abilities?: AbilityDef[];
  /** Pistas para la IA. support: no combate (compra como mucho una a la vez). */
  ai?: { support?: boolean };
  /** Comentario libre (diseño, por que tiene estos numeros). */
  notes?: string;
}

export interface BuildingDef {
  id: string;
  name: Texts;
  /** Cuartel general: si lo capturan, se pierde. Exactamente uno. */
  hq?: boolean;
  earning: number;
  /** Vida que cura a las unidades propias que repara. */
  heals: number;
  /** Multiplicador de la probabilidad de acierto contra quien esta encima (menos = mas defensa). */
  protection: number;
  vision: number;
  classicSprite?: Record<string, string>;
  notes?: string;
}

export interface TerrainDef {
  id: string;
  name: Texts;
  /** Multiplicador del acierto contra quien esta encima. */
  protection: number;
  /** Esconde a quien esta dentro (con niebla y forestHides). */
  hides: boolean;
  buildable: boolean;
  water: boolean;
  /** Coste de entrar por tipo de movimiento; null = no se puede pasar. */
  movement: Record<MovementName, number | null>;
}

/** Lo que cada parte del contenido puede consultar de las demas al validarse (ids conocidos). */
export interface ContentContext {
  unitIds: ReadonlySet<string>;
  buildingIds: ReadonlySet<string>;
  terrainNames: readonly string[];
}
