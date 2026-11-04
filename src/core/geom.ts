/**
 * Utilidades geometricas (Auxiliar.java). Los rangos son rombos (distancia Manhattan) y las areas,
 * cuadrados. Lo que depende de los bordes del mapa los recibe (`GridBounds`: el mapa de la
 * partida, `mapGrid(s)`, o cualquier capa del mismo tamaño).
 */
import type { Pos, Rng } from './model';
import type { GridBounds } from './util/grid';

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** La casilla de algo que esta en una (unidad, edificio, punto del camino): un Pos nuevo, sin sus otros campos. */
export function posOf(thing: Pos): Pos {
  return { x: thing.x, y: thing.y };
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Clave de texto de una casilla, para conjuntos y mapas (`"3,7"`). */
export function posKey(pos: Pos): string {
  return `${pos.x},${pos.y}`;
}

/** Numero de casillas a distancia <= radius: 2r(r+1)+1 (0 si radius < 0). */
export function rangeSize(radius: number): number {
  return radius < 0 ? 0 : 2 * radius * (radius + 1) + 1;
}

/** Casilla numero `indexInRing` del anillo `ring` (> 0) alrededor de `center`, dentro del mapa o no. */
function ringPos(center: Pos, ring: number, indexInRing: number): Pos {
  // Cada anillo tiene 4 lados de `ring` casillas: de abajo a la derecha, a arriba, a la izquierda y vuelta.
  const side = Math.floor(indexInRing / ring);
  const offset = indexInRing % ring;
  const { x, y } = center;
  switch (side) {
    case 0:
      return { x: x + offset, y: y + ring - offset };
    case 1:
      return { x: x + ring - offset, y: y - offset };
    case 2:
      return { x: x - offset, y: y + offset - ring };
    default:
      return { x: x - ring + offset, y: y + offset };
  }
}

/**
 * Casilla numero `index` del rombo alrededor de `center`, anillo a anillo, en el mismo orden
 * que el original (Auxiliar.getRangePos): el 0 es el centro; en cada anillo empieza abajo
 * y gira en sentido antihorario en pantalla (abajo, derecha, arriba, izquierda...).
 * Devuelve null si cae fuera del mapa. El orden importa para la IA y el generador.
 */
export function rangePos(board: GridBounds, center: Pos, index: number): Pos | null {
  if (index < 0 || !board.contains(center)) return null;
  if (index === 0) return posOf(center);
  let ring = 1;
  while (rangeSize(ring) <= index) ring++;
  const pos = ringPos(center, ring, index - rangeSize(ring - 1));
  return board.contains(pos) ? pos : null;
}

/** Las 4 vecinas ortogonales dentro del mapa, en el orden del original: abajo, derecha, arriba, izquierda. */
export function neighbors4(board: GridBounds, pos: Pos): Pos[] {
  // Los indices 1 a 4 del rombo son el primer anillo, en el orden del original.
  return [1, 2, 3, 4].map((index) => rangePos(board, pos, index)).filter((neighbor): neighbor is Pos => neighbor !== null);
}

/** Recorre las casillas a distancia entre minRadius y maxRadius (ambas incluidas) en orden de rombo. */
export function* diamond(board: GridBounds, center: Pos, minRadius: number, maxRadius: number): Generator<Pos> {
  for (let i = rangeSize(minRadius - 1); i < rangeSize(maxRadius); i++) {
    const pos = rangePos(board, center, i);
    if (pos) yield pos;
  }
}

/**
 * Casillas del cuadrado de lado 2*radius+1 alrededor de `center` (columna a columna), dentro del mapa
 * o no: quien llama filtra si hace falta. Areas de habilidades y zonas de los puntos de control.
 */
export function squareArea(center: Pos, radius: number): Pos[] {
  const tiles: Pos[] = [];
  for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) tiles.push({ x: center.x + dx, y: center.y + dy });
  return tiles;
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
