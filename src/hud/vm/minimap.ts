import type { OwnerSide, Side } from './common';

/** Minimapa: colores del terreno, niebla, edificios y unidades (de que lado es cada uno). */

export interface MinimapVM {
  /** Tamaño del mapa en casillas. */
  w: number;
  h: number;
  /** Color de terreno por casilla, fila a fila (y*w+x). */
  terrain: number[];
  fog: boolean[][];
  buildings: { x: number; y: number; owner: OwnerSide }[];
  units: { x: number; y: number; side: Side }[];
}
