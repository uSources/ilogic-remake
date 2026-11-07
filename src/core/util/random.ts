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

/**
 * Las dos semillas del azar de una partida, sacadas una aparte de la otra: la de sus dados
 * (`GameState.dice`) y la de las decisiones de la IA (`GameState.decisionSeed`). Son dos tiradas
 * seguidas del mismo generador de 32 bits, que no es criptografico: a simple vista una no dice la
 * otra, pero quien sepa una puede sacar la otra probando las 2^32 semillas (unos 10 s). Sirve para
 * que la IA no tire los mismos dados que el combate, no para esconder nada.
 */
export interface MatchSeeds {
  dice: number;
  decisions: number;
}

/** Las semillas de una partida sacadas de una sola (dos tiradas seguidas de `seededRng(seed)`). */
export function matchSeedsFrom(seed: number): MatchSeeds {
  const rng = seededRng(seed);
  return { dice: seedFromDraw(rng()), decisions: seedFromDraw(rng()) };
}

/** Multiplicadores para mezclar el dia y el equipo en la semilla de un turno (primos grandes de 32 bits). */
const DAY_MIX = 0x85ebca6b;
const TEAM_MIX = 0xc2b2ae35;

/**
 * La semilla de lo que decide el equipo `team` en su turno del dia `day`: la misma cada vez que se
 * juega ese turno, y otra en cada turno y equipo (pasada por un paso de mulberry32 para mezclarla).
 */
export function turnSeed(decisionSeed: number, day: number, team: number): number {
  const mixed = (decisionSeed ^ Math.imul(day, DAY_MIX) ^ Math.imul(team + 1, TEAM_MIX)) >>> 0;
  return seedFromDraw(randomStep(mixed).value);
}

/** Uno de la lista al azar, todos con la misma probabilidad (undefined si esta vacia: entonces no tira). */
export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(rng() * items.length)];
}

/** Un entero al azar entre `min` y `max`, los dos incluidos, todos con la misma probabilidad. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Uno de la lista al azar, con probabilidad proporcional a su peso (`weightOf`). Si no hay a quien
 * elegir (la lista esta vacia o nada pesa), `otherwise`, lo que dice quien pregunta (con la lista
 * vacia no tira).
 */
export function weightedPick<T, Otherwise>(
  items: readonly T[],
  weightOf: (item: T) => number,
  rng: Rng,
  otherwise: Otherwise,
): T | Otherwise {
  if (!items.length) return otherwise;
  const weighted = items.map((item) => ({ item, weight: weightOf(item) })).filter((entry) => entry.weight > 0);
  let remaining = rng() * weighted.reduce((total, entry) => total + entry.weight, 0);
  for (const entry of weighted) {
    remaining -= entry.weight;
    if (remaining < 0) return entry.item;
  }
  // Por el redondeo (la tirada casi en el total), el ultimo que pesa; si nada pesa, `otherwise`.
  return weighted.at(-1)?.item ?? otherwise;
}

/**
 * Baraja la lista en su sitio (Fisher-Yates desde el final: en cada paso, la ultima sin barajar se
 * cambia por una de las de antes o se queda). Con dos, un solo numero: por debajo de 0.5 se quedan
 * como estan.
 */
export function shuffleInPlace<T>(list: T[], rng: Rng): void {
  for (let last = list.length - 1; last > 0; last--) {
    const other = last - randomInt(rng, 0, last);
    [list[last], list[other]] = [list[other]!, list[last]!];
  }
}
