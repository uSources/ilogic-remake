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

export interface UnitDef {
  /** Nombre interno (en ingles, sin espacios). Las imagenes son u/b_<id>.png, u/r_<id>.png... */
  id: string;
  name: Texts;
  cost: number;
  /** Casillas que puede mover por turno. */
  move: number;
  /** Radio de vision (rombo). */
  vision: number;
  movement: MovementName;
  /** Combustible (0 = no usa) y lo que gasta cada ronda sin moverse (aviones). */
  fuel: { max: number; perTurn: number };
  /** Municion (0 = infinita). */
  ammo: number;
  captures: boolean;
  /**
   * null = no ataca. `range`: distancias desde/hasta (1 = casilla de al lado; [2, 5] = artilleria).
   * `hitChance`: probabilidad de acierto de cada punto de vida contra cada unidad (0..1; si no esta, 0).
   */
  attack: { range: [number, number]; hitChance: Record<string, number> } | null;
  transport?: { slots: number; carries: string[] };
  /** Edificios que la fabrican, la reparan, le dan combustible o municion. */
  builtAt: string[];
  repairedAt: string[];
  refueledAt: string[];
  rearmedAt: string[];
  /** Unidades a las que da combustible o municion (Suministros). */
  supplies?: { fuel: string[]; ammo: string[] };
  /** Vida que da a otras unidades al lado (ninguna en el juego original). */
  heals?: Record<string, number>;
  /** Mientras no tenga dibujo propio, se pinta con el de esta unidad. */
  art?: string;
  /** Graficos de 2013: prefijo de la imagen segun el terreno ("1_" en agua, "2_" en nieve). */
  classicSprite?: Record<string, string>;
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
