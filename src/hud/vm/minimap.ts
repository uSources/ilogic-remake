import type { OwnerSide, Side } from './common';

/** Minimapa: colores del terreno, niebla, edificios, unidades y puntos de control (de que lado es cada uno). */

export interface MinimapVM {
  /** Tamaño del mapa en casillas. */
  w: number;
  h: number;
  /** Color de terreno por casilla, fila a fila (y*w+x). */
  terrain: number[];
  fog: boolean[][];
  buildings: { x: number; y: number; owner: OwnerSide }[];
  units: { x: number; y: number; side: Side }[];
  /** [CAMBIO] Puntos de control (rombo dorado con el color de su dueño). */
  points?: { x: number; y: number; owner: OwnerSide; r: number }[];
}
