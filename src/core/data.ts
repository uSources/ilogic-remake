// Tablas de datos del Ilogic original (2013), extraidas de docs/SPEC-REGLAS.md.
// Se pueden retocar a mano para equilibrar el juego.
// Correcciones respecto al original: tabla "poder" (filas 0, 8 y 17 desalineadas),
// fila 18 de "unitHeals" (faltaba) y fila 2 de PROBS_PER_ADJ (sobraba un valor).

export const UNIT_NAMES = ["Soldier", "Tank", "Artillery", "Car", "LTank", "Blocker", "BSoldier", "Transport", "SSoldier", "Missile_truck", "LFighter", "Fighter", "Bomber", "Supplier", "Antiair", "THelicopter", "MSoldier", "FSoldier", "WTank"] as const;
export const UNIT_TYPES = UNIT_NAMES.length; // 19

/** Estadisticas por tipo de unidad (indices 0..18 como UNIT_NAMES). */
export const UNIT = {
  /** Precio de compra */
  cost: [1500, 12000, 8000, 5000, 7000, 5000, 2500, 8000, 2500, 16000, 12000, 20000, 20000, 6000, 8000, 10000, 2500, 3500, 15000],
  /** Casillas que puede mover por turno */
  mover: [3, 5, 4, 7, 6, 2, 3, 6, 3, 3, 10, 9, 7, 5, 6, 7, 3, 5, 6],
  /** Radio de vision (rombo) */
  vision: [4, 6, 6, 7, 6, 0, 4, 6, 4, 4, 10, 10, 8, 6, 7, 7, 4, 6, 6],
  /** Alcance maximo de ataque */
  alcance: [1, 2, 5, 1, 1, 0, 1, 0, 1, 10, 1, 2, 1, 0, 2, 0, 3, 1, 1],
  /** Se ataca a distancia d con minalc < d <= alcance */
  minalc: [0, 0, 2, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  /** 0 a pie, 1 vehiculo, 2 aereo, 3 anfibio */
  movtype: [0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 2, 2, 2, 1, 1, 2, 0, 1, 3],
  /** 0 = no usa combustible */
  maxfuel: [0, 50, 50, 70, 50, 30, 0, 50, 0, 45, 60, 80, 80, 0, 60, 70, 0, 80, 60],
  /** Combustible que gasta cada ronda (aereos) */
  fuelperturn: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 3, 0, 0, 2, 0, 0, 0],
  /** 0 = municion infinita */
  maxammo: [0, 5, 5, 0, 8, 0, 5, 0, 0, 3, 0, 6, 3, 0, 6, 0, 4, 0, 8],
  /** Plazas de transporte */
  maxcarry: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  /** Puede capturar edificios */
  cancapt: [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, true, false],
  /** Puede atacar */
  canfight: [true, true, true, true, true, false, true, false, true, true, true, true, true, false, true, false, true, true, true],
} as const;

/** [unidad][edificio]: el edificio cura a la unidad */
export const HEALER: readonly (readonly boolean[])[] = [
  [true, false, false, true, false, true],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [true, false, false, true, false, true],
  [false, false, true, false, false, false],
  [true, false, false, true, false, true],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [true, false, false, true, false, true],
  [true, false, false, true, false, true],
  [false, false, true, false, false, false],
];

/** [unidad][edificio]: el edificio rellena el combustible */
export const FUELER: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
  [false, false, false, false, false, false],
  [false, true, false, false, false, false],
  [false, false, false, false, false, false],
  [false, true, false, false, false, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
  [false, false, false, false, true, false],
  [false, false, false, false, false, false],
  [false, true, false, false, false, false],
  [false, true, false, false, false, false],
];

/** [unidad][edificio]: el edificio rellena la municion */
export const AMMO_RESTORER: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, false, false],
  [true, false, false, true, false, true],
  [false, false, false, false, false, false],
  [false, false, false, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [true, false, false, true, false, true],
  [false, false, false, false, false, false],
  [false, false, true, false, false, false],
];

/** [unidad][edificio]: el edificio fabrica ese tipo */
export const SPAWNER: readonly (readonly boolean[])[] = [
  [true, false, false, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [true, false, false, false, false, false],
  [false, false, true, false, false, false],
  [true, false, false, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, false, false, true, false],
  [false, false, true, false, false, false],
  [false, false, true, false, false, false],
  [false, false, false, false, true, false],
  [true, false, false, false, false, false],
  [true, false, false, false, false, false],
  [false, false, true, false, false, false],
];

/** [transporte][pasajero] */
export const CAN_CARRY: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [true, false, false, false, false, false, true, false, true, false, false, false, false, false, false, false, true, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
];

/** [abastecedor][receptor]: da combustible */
export const UNIT_FUELER: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, true, true, true, true, true, false, true, false, true, true, true, true, true, true, true, false, true, true],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
];

/** [abastecedor][receptor]: da municion */
export const UNIT_AMMO_RESTORER: readonly (readonly boolean[])[] = [
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, true, true, false, true, true, false, true, false, true, true, true, true, true, true, true, true, false, true],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
];

/** [atacante][defensor]: probabilidad de acierto por punto de vida */
export const POWER: readonly (readonly number[])[] = [
  [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
  [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.7],
  [0.3, 0.4, 0.4, 0.6, 0.5, 0.25, 0.25, 0.6, 0.3, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.3, 0.3, 0.5],
  [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.6, 0.6, 0.15],
  [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.3, 0.15, 0.3, 0.0, 0.0, 0.0, 0.3, 0.15, 0.0, 0.5, 0.5, 0.15],
  [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
  [0.6, 0.1, 0.1, 0.3, 0.15, 0.05, 0.6, 0.3, 0.15, 0.3, 0.3, 0.3, 0.3, 0.3, 0.15, 0.4, 0.6, 0.6, 0.15],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6, 0.6, 0.6, 0.0, 0.0, 0.8, 0.0, 0.0, 0.0],
  [0.3, 0.5, 0.5, 0.7, 0.5, 0.3, 0.3, 0.7, 0.3, 0.7, 0.0, 0.0, 0.0, 0.7, 0.5, 0.0, 0.3, 0.3, 0.5],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8, 0.8, 0.8, 0.0, 0.0, 0.9, 0.0, 0.0, 0.0],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
  [0.5, 0.1, 0.1, 0.3, 0.15, 0.05, 0.5, 0.2, 0.3, 0.2, 0.0, 0.0, 0.0, 0.2, 0.15, 0.0, 0.5, 0.5, 0.15],
  [0.4, 0.4, 0.4, 0.6, 0.5, 0.2, 0.4, 0.6, 0.4, 0.6, 0.0, 0.0, 0.0, 0.6, 0.5, 0.0, 0.4, 0.4, 0.5],
];

/** [unidad][terreno]: prefijo de imagen (1_ en agua, 2_ en nieve) */
export const UNIT_TERRAIN_PREFIX: readonly (readonly string[])[] = [
  ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "1_", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "", "", "", "", "", "", "", "", "", "2_", "2_", "2_", "2_", "2_"],
  ["", "1_", "", "", "", "", "", "", "1_", "1_", "2_", "2_", "2_", "2_", ""],
];

/** [edificio][terreno]: prefijo de imagen */
export const BUILDING_TERRAIN_PREFIX: readonly (readonly string[])[] = [
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "2_", "", "", "", ""],
];

/** [curador][curado]: vida que una unidad da a otra (todo 0 en el original) */
export const UNIT_HEALS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
];

export const BUILDING_NAMES = ["City", "Oil", "Factory", "Stronghold", "Airport", "Base"] as const;
export const BUILDING_TYPES = BUILDING_NAMES.length; // 6
export const HQ = 5; // Base = cuartel general
export const BUILDING = {
  /** Ingresos por ronda */
  earning: [1000, 500, 1000, 1500, 1000, 1000],
  /** Vida que cura a las unidades propias que puede curar */
  heals: [30, 0, 25, 20, 25, 30],
  /** Multiplicador de la probabilidad de acierto contra la unidad que esta encima */
  protection: [0.8, 0.9, 0.8, 0.7, 0.85, 0.7],
  /** Radio de vision (0 = solo su casilla) */
  vision: [0, 0, 0, 0, 0, 0],
} as const;

export const TERRAIN_NAMES = ["Grass", "Water", "Woods", "Sand", "Cactus", "SandCliff", "Flowers", "GrassCliff", "SWater", "DWater", "Snow", "Frosty", "SnowCliff", "SnowWood", "Ice"] as const;
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
export const T_GRASS = 0, T_WATER = 1, T_SNOW = 10, T_SWATER = 8, T_DWATER = 9, T_ICE = 14;

// ---- Generador de mapas (RandomMap) ----
export const THEME_NAMES = ["Plains", "Desert", "Forest", "Swamp", "Snowy"] as const;
export const TILE_BASE_PROBS: readonly (readonly number[])[] = [[0.05, 0.005, 0.05, 0.0, 0.0, 0.0, 0.03, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.005, 0.0, 0.05, 0.03, 0.03, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.05, 0.005, 0.1, 0.0, 0.0, 0.0, 0.01, 0.02, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.05, 0.03, 0.05, 0.0, 0.0, 0.0, 0.0, 0.01, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.005, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.015, 0.02, 0.05, 0.0]];
export const PROBS_PER_ADJ: readonly (readonly number[])[] = [[0.2, 0.3, 0.03, 0.0, 0.0, 0.0, 0.01, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.3, 0.0, 0.2, -0.05, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.1, 0.3, 0.15, 0.0, 0.0, 0.0, 0.005, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.05, 0.12, 0.02, 0.0, 0.0, 0.0, 0.0, -0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0], [0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, -0.05, -0.05, 0.03, 0.0]];
export const MAPGEN = {"MINNB": 24, "MAXNB": 30, "MAXSPAWNDIST": 2, "MINUCAP": 9, "MINBCAP": 6, "MINTILENUM": 200, "MINNBS": [8, 5, 3, 3, 1, 0], "MAXNBS": [11, 9, 5, 6, 3, 0], "INITUS": [0, 0, 2], "INITBS": [5, 0, 2, 1, 4], "isSWater": [true, true, true, true, false], "isIce": [false, false, false, false, true]} as const;

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
  /** 'instant' = original (enemigo -> neutral -> tuyo); 'points' = por puntos en varios turnos. */
  capture: 'instant' | 'points';
  /** Puntos de captura de un edificio y de la Base (modo 'points'). */
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

/** Las reglas del juego de 2013. */
export const CLASSIC_RULES: Readonly<RulesConfig> = {
  initialFunds: 5000,
  maxUnits: 30,
  counterattack: false,
  damageSpread: null,
  capture: 'instant',
  capturePoints: 20,
  hqCapturePoints: 20,
  incomeScale: 1,
  fog: true,
  dayLimit: null,
  veterancy: false,
  passAllies: false,
  ambush: false,
  forestHides: false,
  terrainCost: false,
};

/** Las reglas nuevas del remake (plan de gameplay). */
export const MODERN_RULES: Readonly<RulesConfig> = {
  ...CLASSIC_RULES,
  counterattack: true,
  damageSpread: 0.1,
  capture: 'points',
  capturePoints: 20,
  hqCapturePoints: 30,
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
export const RULES: RulesConfig = { ...MODERN_RULES };

export function useRules(r: Partial<RulesConfig>): void {
  Object.assign(RULES, CLASSIC_RULES, r);
}
export const MAX_FUNDS = 999999;
export const AI = { MAXMERGELIFE: 130, MAXCAPTDIST: 8, LIFETOBACK: 40 } as const;
