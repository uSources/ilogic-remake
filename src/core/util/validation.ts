/**
 * Comprobar datos que vienen de fuera (una partida guardada, un fichero de contenido): numeros
 * enteros en un intervalo y casillas bien formadas. Sin efectos.
 */
import type { Pos } from '../model';
import type { GridBounds } from './grid';

/** Un objeto (no null) del que se pueden leer campos: para comprobar datos que vienen de fuera (JSON). */
export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** El mayor uid que puede tener una unidad (los da un contador que solo sube). */
export const MAX_UID = Number.MAX_SAFE_INTEGER;

/** Un entero entre `min` y `max` (los dos incluidos). */
export const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Una casilla bien formada (x e y enteros). */
export const isPos = (value: unknown): value is Pos => isObject(value) && Number.isInteger(value.x) && Number.isInteger(value.y);

/** Una casilla bien formada y dentro de `board`. */
export const isPosOn = (board: GridBounds, value: unknown): value is Pos => isPos(value) && board.contains(value);

/** Un uid bien formado (entero desde 1). */
export const isUid = (value: unknown): value is number => isInt(value, 1, MAX_UID);
