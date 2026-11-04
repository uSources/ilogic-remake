/**
 * Rejillas con una casilla por posicion del mapa: terreno, vision, distancias, alcance... Se leen y
 * recorren con `at`, `set` y `forEach`/`cells`, sin escribir `grid[x]![y]!` ni dos bucles anidados
 * cada vez (docs/ESTILO.md, regla 5). El tamaño va con la rejilla: no hay un tamaño de mapa global.
 */
import type { Pos } from '../model';

/** Ancho y alto de una rejilla (el mapa o cualquier capa del mismo tamaño). */
export interface GridSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Los bordes de una rejilla: su tamaño y si una casilla cae dentro. Lo que solo necesita saber donde
 * acaba el mapa (geom, el generador, leer partidas) recibe esto: el mapa (`mapGrid(s)`) o una capa.
 */
export interface GridBounds extends GridSize {
  contains(pos: Pos): boolean;
}

/** La casilla cae dentro de una rejilla de ese tamaño (fuera de este modulo: `contains`). */
function isInside(size: GridSize, pos: Pos): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < size.width && pos.y < size.height;
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(value, max));

/** Una casilla y lo que hay en ella. */
export interface GridCell<T> {
  pos: Pos;
  value: T;
}

/** Una rejilla `columns[x][y]`. Las casillas que se leen o escriben tienen que estar dentro (`contains`). */
export class Grid<T> implements GridBounds {
  readonly width: number;
  readonly height: number;

  private constructor(readonly columns: T[][]) {
    this.width = columns.length;
    this.height = columns[0]?.length ?? 0;
  }

  /** La casilla cabe en una rejilla de ese tamaño (sin crear la rejilla). */
  static fits(size: GridSize, pos: Pos): boolean {
    return isInside(size, pos);
  }

  /** Rejilla nueva de ese tamaño con todas las casillas a `fill`. */
  static filled<T>(size: GridSize, fill: T): Grid<T> {
    return new Grid(Array.from({ length: size.width }, () => Array<T>(size.height).fill(fill)));
  }

  /** Mira unas columnas que ya existen (sin copiarlas: escribir en la rejilla las cambia). */
  static wrap<T>(columns: T[][]): Grid<T> {
    return new Grid(columns);
  }

  contains(pos: Pos): boolean {
    return isInside(this, pos);
  }

  at(pos: Pos): T {
    return this.columns[pos.x]![pos.y]!;
  }

  /** La casilla, o la del borde mas cercana si cae fuera (para dibujar los bordes del mapa). */
  atClamped(pos: Pos): T {
    return this.at({ x: clamp(pos.x, this.width - 1), y: clamp(pos.y, this.height - 1) });
  }

  set(pos: Pos, value: T): void {
    this.columns[pos.x]![pos.y] = value;
  }

  /** Cada casilla con su valor, columna a columna (x y luego y), el mismo orden que los bucles de siempre. */
  *cells(): Generator<GridCell<T>> {
    for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height; y++) yield { pos: { x, y }, value: this.at({ x, y }) };
  }

  forEach(visit: (value: T, pos: Pos) => void): void {
    for (const { pos, value } of this.cells()) visit(value, pos);
  }

  /** Otra rejilla del mismo tamaño, con todas las casillas a `fill` (una capa sobre el mapa). */
  createLayer<U>(fill: U): Grid<U> {
    return Grid.filled(this, fill);
  }
}
