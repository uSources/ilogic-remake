import type { Pos } from '../../core/model';
import { TILE } from '../../layout';

/**
 * Cuentas de casillas a pixeles de mundo que repiten todas las capas del mapa y los efectos.
 * El mapa va en coordenadas de mundo: 1 unidad = 1 pixel del dibujo, TILE pixeles por casilla.
 */

/** Centro de una casilla en pixeles de mundo. */
export const tileCenter = (pos: Pos): { x: number; y: number } => ({ x: pos.x * TILE + TILE / 2, y: pos.y * TILE + TILE / 2 });

/** Casilla de debajo: la de los dibujos altos (arboles, tejados) que sobresalen por delante de `tile`. */
export const tileInFront = (tile: Pos): Pos => ({ x: tile.x, y: tile.y + 1 });

/** Casilla de una clave "x,y" (las de `ViewOptions.highlights`). */
export const parseTileKey = (key: string): [number, number] => key.split(',').map(Number) as [number, number];
