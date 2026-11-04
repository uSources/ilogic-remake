/**
 * Tablas del generador de mapas del original (RandomMap, 2013): probabilidad de cada terreno por tema,
 * cuanto suma cada vecina igual y los topes de edificios y unidades. Las usa mapgen.ts.
 * Correccion respecto al original: fila 2 de PROBS_PER_ADJ (sobraba un valor).
 */
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
