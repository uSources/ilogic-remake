import { MAP_H, MAP_W } from './data';
import type { Pos, Rng } from './types';

/** Utilidades geometricas (Auxiliar.java). Todos los rangos son rombos (distancia Manhattan). */

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && x < MAP_W && y >= 0 && y < MAP_H;
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Numero de casillas a distancia <= radius: 2r(r+1)+1 (0 si radius < 0). */
export function rangeSize(radius: number): number {
  return radius < 0 ? 0 : 2 * radius * (radius + 1) + 1;
}

/**
 * Casilla numero `index` del rombo alrededor de `center`, anillo a anillo, en el mismo orden
 * que el original (Auxiliar.getRangePos): el 0 es el centro; en cada anillo empieza abajo
 * y gira en sentido antihorario en pantalla (abajo, derecha, arriba, izquierda...).
 * Devuelve null si cae fuera del mapa. El orden importa para la IA y el generador.
 */
export function rangePos(center: Pos, index: number): Pos | null {
  if (index < 0 || !inBounds(center.x, center.y)) return null;
  if (index === 0) return { x: center.x, y: center.y };
  let ring = 1;
  while (rangeSize(ring) <= index) ring++;
  // Cada anillo tiene 4 lados de `ring` casillas: de abajo a la derecha, a arriba, a la izquierda y vuelta.
  const indexInRing = index - rangeSize(ring - 1);
  const side = Math.floor(indexInRing / ring);
  const offset = indexInRing % ring;
  const { x, y } = center;
  let pos: Pos;
  switch (side) {
    case 0:
      pos = { x: x + offset, y: y + ring - offset };
      break;
    case 1:
      pos = { x: x + ring - offset, y: y - offset };
      break;
    case 2:
      pos = { x: x - offset, y: y + offset - ring };
      break;
    default:
      pos = { x: x - ring + offset, y: y + offset };
  }
  return inBounds(pos.x, pos.y) ? pos : null;
}

/** Las 4 vecinas ortogonales dentro del mapa, en el orden del original: abajo, derecha, arriba, izquierda. */
export function neighbors4(p: Pos): Pos[] {
  const neighbors: Pos[] = [];
  // Los indices 1 a 4 del rombo son el primer anillo, en el orden del original.
  for (let i = 1; i <= 4; i++) {
    const neighbor = rangePos(p, i);
    if (neighbor) neighbors.push(neighbor);
  }
  return neighbors;
}

/** Recorre las casillas a distancia entre minRadius y maxRadius (ambas incluidas) en orden de rombo. */
export function* diamond(center: Pos, minRadius: number, maxRadius: number): Generator<Pos> {
  for (let i = rangeSize(minRadius - 1); i < rangeSize(maxRadius); i++) {
    const pos = rangePos(center, i);
    if (pos) yield pos;
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
