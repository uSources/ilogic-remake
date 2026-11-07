/** Tipos y nombres comunes del contenido del juego (sin logica). */

/** Texto en los dos idiomas del juego. */
export interface Texts {
  es: string;
  en: string;
}

/**
 * Un tipo de movimiento: por donde pasa una unidad y cuanto le cuesta cada terreno. Es el id de
 * movements.json (contenido, no codigo: `content.movements`), el nombre que escriben los demas JSON.
 */
export type MoveType = string;

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
  | { kind: 'zoneOfControl'; stops: MoveType[] }
  | { kind: 'aura'; radius: number; defense: number }
  | { kind: 'piercing'; ignoreCover: number }
  | { kind: 'scout' }
  | { kind: 'quickCapture'; factor: number };

/** Las clases de habilidad (sus validaciones: content/abilities.ts; lo que hacen: core/abilities.ts). */
export type AbilityKind = AbilityDef['kind'];

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
  movement: MoveType;
  captures: boolean;
  /**
   * null = no ataca. `range`: distancias desde/hasta (1 = casilla de al lado; [2, 5] = artilleria).
   * `firesAfterMove`: puede moverse y disparar en el mismo turno (la artilleria no).
   * `hitChance`: probabilidad de acierto de cada punto de vida contra cada unidad (0..1; si no esta, 0).
   */
  attack: { range: [number, number]; firesAfterMove: boolean; hitChance: Record<string, number> } | null;
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
  /** Letra en el mapa de la partida por texto (mayuscula; minuscula si es de otro equipo). */
  textLetter: string;
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
  movement: Record<MoveType, number | null>;
  /** Letra del terreno en los mapas en texto de las misiones si no depende del tema (themes.json, "mapLetters"). */
  mapLetter?: string;
  /** Letra en el mapa de la partida por texto (npm run play), una por terreno. */
  textLetter: string;
  /** El suelo llano: el de los mapas vacios (laboratorio, duelos, pruebas). Exactamente uno. */
  plain?: boolean;
}

/** Lo que cada parte del contenido puede consultar de las demas al validarse (ids conocidos). */
export interface ContentContext {
  /** Los tipos de movimiento (movements.json), en su orden. */
  movementIds: readonly string[];
  unitIds: ReadonlySet<string>;
  buildingIds: ReadonlySet<string>;
  terrainIds: ReadonlySet<string>;
  themeIds: ReadonlySet<string>;
}
