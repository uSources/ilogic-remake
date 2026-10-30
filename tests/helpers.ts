import { grid } from '@core/geom';
import type { GameState } from '@core/types';

/** Partida vacia toda de hierba, para tests de reglas. */
export function blankState(): GameState {
  return { version: 1, map: grid(0), theme: 0, funds: [5000, 5000], units: [], buildings: [], nextUid: 1, day: 1 };
}
