/**
 * La busqueda de rival: los ritmos que se pueden buscar y lo que trae cada uno. El servidor prepara
 * la sala con esto (server/src/matchmaker.ts) y la pantalla lo enseña (cuanto dura cada turno): una
 * sola tabla para los dos. En la busqueda no se eligen reglas: 1 contra 1, las de siempre y mapa al
 * azar. Si cada uno eligiera las suyas, la cola se partiria y, con poca gente, nadie coincidiria.
 */
import type { MAP_SIZES } from '../data';

export const SEARCH_PACES = ['daily', 'live'] as const;
/** Por turnos (un dia por turno: se juega cuando se puede) o en vivo (los dos delante, un par de minutos por turno). */
export type SearchPace = (typeof SEARCH_PACES)[number];

export interface PaceRules {
  /** Segundos de cada turno: al acabarse, el turno pasa solo. */
  turnSeconds: number;
  mapSize: (typeof MAP_SIZES)[number];
  /**
   * Si quien busca tiene que estar en la sala para que le llegue un rival. En vivo, si: si se ha ido,
   * su sala espera a que vuelva. Por turnos, no: la partida empieza y se entera en «Mis partidas».
   */
  needsSearcherIn: boolean;
}

const MINUTE_SECONDS = 60;
const DAY_SECONDS = 24 * 60 * MINUTE_SECONDS;

export const PACE_RULES: Readonly<Record<SearchPace, PaceRules>> = {
  daily: { turnSeconds: DAY_SECONDS, mapSize: 32, needsSearcherIn: false },
  live: { turnSeconds: 2 * MINUTE_SECONDS, mapSize: 20, needsSearcherIn: true },
};

export const isSearchPace = (value: unknown): value is SearchPace => (SEARCH_PACES as readonly unknown[]).includes(value);

/** Cuantas salas suyas puede decir quien busca (`avoid`) para que no le toque una de ellas. */
export const MAX_AVOIDED_ROOMS = 16;
