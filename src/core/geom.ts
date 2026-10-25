import { MAP_H, MAP_W } from './data';
import type { Pos, Rng } from './types';

/** Utilidades geometricas (Auxiliar.java). Todos los rangos son rombos (distancia Manhattan). */

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Numero de casillas a distancia <= r: 2r(r+1)+1 (0 si r < 0). */
export function rangeSize(r: number): number {
  return r < 0 ? 0 : 2 * r * (r + 1) + 1;
}

/**
 * Casilla numero `index` del rombo alrededor de `c`, anillo a anillo, en el mismo orden
 * que el original (Auxiliar.getRangePos): el 0 es el centro; en cada anillo empieza abajo
 * y gira en sentido antihorario en pantalla (abajo, derecha, arriba, izquierda...).
 * Devuelve null si cae fuera del mapa. El orden importa para la IA y el generador.
 */
export function rangePos(c: Pos, index: number): Pos | null {
  if (index < 0 || !inBounds(c.x, c.y)) return null;
  if (index === 0) return { x: c.x, y: c.y };
  let r = 1;
  while (rangeSize(r) <= index) r++;
  const k = index - rangeSize(r - 1);
  const side = Math.floor(k / r);
  const o = k % r;
  let x: number, y: number;
  switch (side) {
    case 0:
      x = c.x + o;
      y = c.y + r - o;
      break;
    case 1:
      x = c.x + r - o;
      y = c.y - o;
      break;
    case 2:
      x = c.x - o;
      y = c.y + o - r;
      break;
    default:
      x = c.x - r + o;
      y = c.y + o;
  }
  return inBounds(x, y) ? { x, y } : null;
}

/** Las 4 vecinas ortogonales dentro del mapa, en el orden del original: abajo, derecha, arriba, izquierda. */
export function neighbors4(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (let i = 1; i <= 4; i++) {
    const q = rangePos(p, i);
    if (q) out.push(q);
  }
  return out;
}

/** Recorre las casillas con minR <= d <= maxR en orden de rombo. */
export function* diamond(c: Pos, minR: number, maxR: number): Generator<Pos> {
  for (let i = rangeSize(minR - 1); i < rangeSize(maxR); i++) {
    const p = rangePos(c, i);
    if (p) yield p;
  }
}

export function grid<T>(fill: T): T[][] {
  return Array.from({ length: MAP_W }, () => Array<T>(MAP_H).fill(fill));
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** PRNG con semilla (mulberry32) para tests y partidas reproducibles. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
