/** Minimapa: colores del terreno, niebla, edificios, unidades y puntos de control. */

export interface MinimapVM {
  /** Tamaño del mapa en casillas. */
  w: number;
  h: number;
  /** Color de terreno por casilla, fila a fila (y*w+x). */
  terrain: number[];
  fog: boolean[][];
  buildings: { x: number; y: number; owner: 0 | 1 | null }[];
  units: { x: number; y: number; team: 0 | 1 }[];
  /** [CAMBIO] Puntos de control (rombo dorado con el color de su dueño). */
  points?: { x: number; y: number; owner: 0 | 1 | null; r: number }[];
}
