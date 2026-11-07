/**
 * Quien va por delante en una partida sin terminar (la arena y el informe de equilibrio la dan a
 * quien tiene clara ventaja): la fuerza de cada equipo y cuando la ventaja es clara. Una sola vez, para
 * que las dos herramientas cuenten igual.
 */

/** Lo que tiene un equipo: valor del ejercito (coste x vida / 100), edificios y dinero. */
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

/** Fuerza de un equipo: ejercito, edificios y algo del dinero. */
export const strengthOf = (holdings: Holdings): number =>
  holdings.army + holdings.buildings * STRENGTH_PER_BUILDING + holdings.funds * STRENGTH_PER_FUNDS;

/** Un equipo y su fuerza. */
export interface TeamStrength {
  /** Su puesto en la lista que se ha dado (en el informe, el numero de equipo). */
  team: number;
  strength: number;
}

/** Los equipos de mas a menos fuertes (a igual fuerza, en el orden en que se dan). */
export const strengthRanking = (teams: readonly Holdings[]): TeamStrength[] =>
  teams.map((holdings, team) => ({ team, strength: strengthOf(holdings) })).sort((first, second) => second.strength - first.strength);

/**
 * Quien va claramente por delante (su puesto en `teams`): el mas fuerte, si tiene al menos CLEAR_LEAD
 * veces la fuerza del siguiente y mas que el; null si van parejos.
 */
export function clearLeader(teams: readonly Holdings[]): number | null {
  const [leader, runnerUp] = strengthRanking(teams);
  if (!leader || !runnerUp) return leader?.team ?? null;
  return leader.strength > runnerUp.strength && leader.strength >= CLEAR_LEAD * runnerUp.strength ? leader.team : null;
}
