/**
 * Lo que comparten las piezas del relieve (relief.ts, massif.ts, reliefColors.ts): como es un relieve,
 * lo que se sabe del mapa y la rejilla de subcasillas en la que se calcula (SUBCELLS x SUBCELLS por
 * casilla, columnas de 2 pixeles de Ashfox).
 */
import type { Pos } from '../../../core/model';

export type ReliefShape = 'peak' | 'mesa' | 'dunes';

/** Un color desde una altura sobre el suelo (casillas). */
export interface ReliefBand {
  from: number;
  color: number;
}

/** Como es un relieve: su forma y sus colores. */
export interface ReliefStyle {
  shape: ReliefShape;
  /** Los colores por alturas (faldas, roca, nieve...), de abajo arriba. */
  bands: readonly ReliefBand[];
  /** El color de la roca pelada de las laderas empinadas (si no, las laderas son del color de su altura). */
  cliff?: number;
}

/** Una casilla con relieve y su estilo. */
export interface ReliefTile {
  pos: Pos;
  style: ReliefStyle;
}

/** Lo que el relieve necesita saber del mapa. */
export interface ReliefMap {
  width: number;
  height: number;
  tiles: readonly ReliefTile[];
  /** La altura del suelo de una casilla (de donde sube el relieve y donde se apoya una falda). */
  groundAt(pos: Pos): number;
  /** Las faldas pueden salirse a esa casilla (no al agua: ahi no se dibujan). */
  canSpill(pos: Pos): boolean;
}

/** Lo que sube el relieve en una subcasilla: cuanto y con que estilo (el del relieve mas alto ahi). */
export interface Rise {
  height: number;
  style: ReliefStyle;
}

/** Subcasillas por lado de cada casilla. */
export const SUBCELLS = 8;
/** Un pixel de Ashfox, en casillas: las alturas van en pasos de uno. */
export const PIXEL = 1 / 16;

/** Un numero entre 0 y 1 que sale siempre igual para el mismo sitio. */
export function noise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

export const tileOfSubcell = (sub: Pos): Pos => ({ x: Math.floor(sub.x / SUBCELLS), y: Math.floor(sub.y / SUBCELLS) });
/** El centro de una subcasilla, en casillas (el de la casilla (x, y) es (x, y)). */
export const subcellCenter = (sub: Pos): Pos => ({ x: (sub.x + 0.5) / SUBCELLS - 0.5, y: (sub.y + 0.5) / SUBCELLS - 0.5 });
export const tileKey = (pos: Pos): string => `${pos.x},${pos.y}`;
