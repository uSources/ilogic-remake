/**
 * Rejillas del mapa (una casilla por posicion: terreno, distancias, alcance...). Ayudas para leer y
 * recorrer sin escribir `grid[x]![y]!` ni dos bucles anidados cada vez (docs/ESTILO.md, regla 5).
 */
import type { Pos } from '../model';

/** Una rejilla del mapa: `grid[x][y]`. */
export type Grid<T> = T[][];

/** Lo que hay en la casilla. La posicion tiene que estar dentro del mapa. */
export function cellAt<T>(grid: Grid<T>, pos: Pos): T {
  return grid[pos.x]![pos.y]!;
}

export function setCell<T>(grid: Grid<T>, pos: Pos, value: T): void {
  grid[pos.x]![pos.y] = value;
}

/** Cada casilla con su valor, columna a columna (x y luego y), el mismo orden que los bucles de siempre. */
export function* cells<T>(grid: Grid<T>): Generator<{ pos: Pos; value: T }> {
  for (let x = 0; x < grid.length; x++) {
    const column = grid[x]!;
    for (let y = 0; y < column.length; y++) yield { pos: { x, y }, value: column[y]! };
  }
}
