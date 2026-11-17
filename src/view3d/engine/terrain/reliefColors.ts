/**
 * El color de cada columna del relieve, para que una montaña no sea de un solo color: el de su altura
 * (las bandas de su estilo: faldas, roca, nieve), con el borde entre bandas irregular; roca pelada en
 * las laderas empinadas; manchas mas claras y mas oscuras por el macizo; y un poco de variacion de
 * una columna a otra.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import { seededRng } from '../../../core/util/random';
import { valueNoise } from '../../../core/util/valueNoise';
import { noise, type ReliefStyle } from './reliefGrid';

/** Lo que se mueve el borde entre dos bandas (casillas de mas o de menos): asi no es una linea recta. */
const BAND_JITTER = 0.22;
/** Cada cuantas subcasillas cambia ese borde. */
const BAND_GRAIN = 2;
/** Desde que desnivel entre una columna y su vecina (casillas) la ladera es roca pelada. */
const STEEP_DROP = 0.3;
/** Lo que aclaran u oscurecen las manchas del macizo, y cada cuantas subcasillas cambian. */
const PATCH_STRENGTH = 0.22;
const PATCH_SPACING = 6;
/** Lo que varia el tono de una columna a otra. */
const TONE_JITTER = 0.06;
const PATCH_SEED = 1984;

/** Lo que hace falta para pintar las columnas: las manchas del macizo, calculadas una vez. */
export interface ReliefPalette {
  colorOf(style: ReliefStyle, rise: number, drop: number, sub: Pos): THREE.Color;
}

export function reliefPalette(size: Grid<unknown>): ReliefPalette {
  const patches = valueNoise(size, PATCH_SPACING, seededRng(PATCH_SEED));
  return {
    colorOf(style, rise, drop, sub) {
      const base = drop >= STEEP_DROP && style.cliff !== undefined ? style.cliff : bandColor(style, rise, sub);
      const patch = 1 + (patches.at(sub) - 0.5) * PATCH_STRENGTH;
      const tone = 1 - TONE_JITTER / 2 + noise(sub.x, sub.y, 3) * TONE_JITTER;
      return new THREE.Color(base).multiplyScalar(patch * tone);
    },
  };
}

/** El color de la banda de esa altura, con el borde movido un poco segun el sitio. */
function bandColor(style: ReliefStyle, rise: number, sub: Pos): number {
  const shifted = rise + (noise(Math.floor(sub.x / BAND_GRAIN), Math.floor(sub.y / BAND_GRAIN), 5) - 0.5) * BAND_JITTER;
  const band = [...style.bands].reverse().find((candidate) => shifted >= candidate.from) ?? style.bands[0]!;
  return band.color;
}
