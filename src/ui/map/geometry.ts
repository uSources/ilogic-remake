import { MAP_H, MAP_W } from '../../core/data';
import type { Pos } from '../../core/types';
import { TILE } from '../../layout';

/**
 * Cuentas de casillas a pixeles de mundo que repiten todas las capas del mapa y los efectos.
 * El mapa va en coordenadas de mundo: 1 unidad = 1 pixel del dibujo, TILE pixeles por casilla.
 */

/** Centro de una casilla en pixeles de mundo. */
export const tileCenter = (p: Pos): { x: number; y: number } => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 });

/** La casilla esta dentro del mapa actual. */
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

/** Casilla de una clave "x,y" (las de `ViewOptions.highlights`). */
export const parseTileKey = (k: string): [number, number] => k.split(',').map(Number) as [number, number];

/** Recorre todas las casillas del mapa (columna a columna, como las rejillas `[x][y]`). */
export function forEachTile(fn: (x: number, y: number) => void): void {
  for (let x = 0; x < MAP_W; x++) for (let y = 0; y < MAP_H; y++) fn(x, y);
}
