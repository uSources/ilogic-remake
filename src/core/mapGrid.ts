/**
 * El mapa de una partida como rejilla. El tamaño del mapa sale siempre del estado (`s.map`): no hay
 * un tamaño global, asi que dos partidas de tamaños distintos (la de la pantalla y la miniatura del
 * menu, o dos partidas en un servidor) no se pisan.
 */
import type { GameState, Pos } from './model';
import { Grid } from './util/grid';

type WithMap = Pick<GameState, 'map'>;

/** El terreno de la partida como rejilla (sin copiarlo). Su `width`/`height` es el tamaño del mapa. */
export function mapGrid(s: WithMap): Grid<number> {
  return Grid.wrap(s.map);
}

/** Terreno de una casilla (tiene que estar dentro del mapa). */
export function terrainAt(s: WithMap, pos: Pos): number {
  return mapGrid(s).at(pos);
}

/** La casilla esta dentro del mapa de la partida. */
export function isOnBoard(s: WithMap, pos: Pos): boolean {
  return mapGrid(s).contains(pos);
}

/** Una capa nueva del tamaño del mapa con todas las casillas a `fill` (vision, distancias, alcance...). */
export function createLayer<T>(s: WithMap, fill: T): Grid<T> {
  return mapGrid(s).createLayer(fill);
}

/** Terreno nuevo de `size` casillas de lado, todo de `terrain` (lo rellenan el generador o las misiones). */
export function blankMap(size: number, terrain = 0): number[][] {
  return Grid.filled({ width: size, height: size }, terrain).columns;
}
