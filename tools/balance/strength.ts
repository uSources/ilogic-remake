/**
 * Quien va por delante en una partida sin terminar (la arena y el informe de equilibrio la dan a
 * quien tiene clara ventaja): la fuerza de cada lado y cuando la ventaja es clara. Una sola vez, para
 * que las dos herramientas cuenten igual.
 */

/** Lo que tiene un lado: valor del ejercito (coste x vida / 100), edificios y dinero. */
export interface Holdings {
  army: number;
  buildings: number;
  funds: number;
}

/** Lo que vale cada edificio (lo que rinde en unas rondas) y cada moneda, en valor de ejercito. */
const STRENGTH_PER_BUILDING = 1500;
const STRENGTH_PER_FUNDS = 0.5;
/** Ventaja minima (un 15 % mas de fuerza) para dar ganada una partida sin terminar. */
const CLEAR_LEAD = 1.15;

/** Fuerza de un lado: ejercito, edificios y algo del dinero. */
export const strengthOf = (holdings: Holdings): number =>
  holdings.army + holdings.buildings * STRENGTH_PER_BUILDING + holdings.funds * STRENGTH_PER_FUNDS;

/** Quien va claramente por delante (al menos CLEAR_LEAD), o null si estan parejos. */
export function clearLeader(first: Holdings, second: Holdings): 'first' | 'second' | null {
  const firstStrength = strengthOf(first),
    secondStrength = strengthOf(second);
  if (Math.max(firstStrength, secondStrength) < CLEAR_LEAD * Math.min(firstStrength, secondStrength)) return null;
  return firstStrength > secondStrength ? 'first' : 'second';
}
