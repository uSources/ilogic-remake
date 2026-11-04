/**
 * Crear una partida vacia: el unico sitio que escribe la forma de un GameState nuevo. La usan el
 * generador de mapas, las misiones, el laboratorio, las herramientas y los tests.
 */
import type { GameContent } from './content';
import { withContent } from './gameContent';
import type { GameState, RulesConfig } from './model';

/** Lo que hace falta para empezar una partida: su mapa y sus reglas (el resto sale de ellas). */
export interface NewGameStateOptions {
  /** Terreno `map[x][y]`: su tamaño es el de la partida. */
  map: number[][];
  rules: RulesConfig;
  /** Contenido con el que se juega (unidades, edificios, terreno...): `defaultContent()` o una variante. */
  content: GameContent;
  /** Tema del mapa (0 = llanura). */
  theme?: number;
  /** Dinero de cada bando al empezar (si no, `rules.initialFunds` para los dos). */
  funds?: [number, number];
}

/** Partida sin unidades ni edificios, en el dia 1, con su contenido. */
export function newGameState(options: NewGameStateOptions): GameState {
  const { map, rules } = options;
  const s: GameState = {
    version: 1,
    map,
    theme: options.theme ?? 0,
    funds: options.funds ?? [rules.initialFunds, rules.initialFunds],
    units: [],
    buildings: [],
    nextUid: 1,
    day: 1,
    rules,
  };
  return withContent(s, options.content);
}
