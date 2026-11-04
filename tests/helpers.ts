import { blankMap } from '@core/mapGrid';
import type { GameState } from '@core/model';

/** Lado del mapa de las partidas de prueba (como el original). */
export const BLANK_SIZE = 32;

/** Partida vacia toda de hierba, para tests de reglas. */
export function blankState(): GameState {
  return { version: 1, map: blankMap(BLANK_SIZE), theme: 0, funds: [5000, 5000], units: [], buildings: [], nextUid: 1, day: 1 };
}
