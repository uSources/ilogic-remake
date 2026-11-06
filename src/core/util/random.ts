/**
 * Numeros al azar con semilla (mulberry32). Todo el estado del generador es un entero de 32 bits:
 * cabe en una partida guardada (`GameState.dice`, ver core/dice.ts) y la misma semilla da siempre la
 * misma tirada, en el juego, en las herramientas y en los tests.
 */
import type { Rng } from '../model';

/** Un paso de mulberry32: el numero que sale (en [0, 1)) y el estado siguiente. */
export interface RandomStep {
  value: number;
  next: number;
}

/** Lo que suma cada paso al estado (la constante de mulberry32). */
const STATE_INCREMENT = 0x6d2b79f5;
/** 2^32: pasa un entero sin signo de 32 bits a [0, 1). */
const UINT32_RANGE = 4294967296;

/** Un paso de mulberry32 desde el estado `state` (un entero sin signo de 32 bits). */
export function randomStep(state: number): RandomStep {
  const next = (state + STATE_INCREMENT) >>> 0;
  let mixed = next;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return { value: ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE, next };
}

/** Generador con semilla para quien decide (IA, mapas, herramientas): cada llamada da un numero en [0, 1). */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    const step = randomStep(state);
    state = step.next;
    return step.value;
  };
}

/**
 * La semilla (entero sin signo de 32 bits) que da un numero ya sacado de un `Rng` de mulberry32: el
 * numero lleva los 32 bits enteros, asi que sirve de semilla sin gastar otra tirada.
 */
export function seedFromDraw(draw: number): number {
  return Math.floor(draw * UINT32_RANGE) >>> 0;
}

/** El valor es un estado valido del generador (entero sin signo de 32 bits). */
export function isRandomState(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < UINT32_RANGE;
}

/** Mezcla para que las decisiones de la IA no salgan de la misma semilla que el mapa. */
const AI_SEED_MIX = 0x9e3779b9;

/** La semilla de las decisiones de la IA de una partida, sacada de la del mapa (la misma en todas partes). */
export const aiSeedFor = (mapSeed: number): number => (mapSeed ^ AI_SEED_MIX) >>> 0;
