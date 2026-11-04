/**
 * Navegacion con teclado por una rejilla de botones (filas de ids). Un mismo id puede ocupar varias
 * casillas (una tarjeta alta); al moverse se salta a la siguiente casilla con un id distinto.
 */
export function navGrid(rows: string[][], current: string, dx: number, dy: number): string {
  const rowIndex = rows.findIndex((row) => row.includes(current));
  if (rowIndex < 0) return rows[0]?.[0] ?? current;
  const column = rows[rowIndex]!.indexOf(current);
  if (dx) return sideways(rows[rowIndex]!, column, current, dx);
  return vertically(rows, rowIndex, column, current, dy);
}

/** A los lados: la siguiente casilla de la fila con otro id, o la misma si no hay. */
function sideways(row: string[], column: number, current: string, dx: number): string {
  let index = column;
  // Saltar las casillas que repiten el mismo id.
  if (dx > 0) while (index < row.length && row[index] === current) index++;
  else while (index >= 0 && row[index] === current) index--;
  return index >= 0 && index < row.length ? row[index]! : current;
}

/** Columna equivalente en otra fila (por proporcion si las filas tienen distinto largo). */
function matchingColumn(from: string[], to: string[], column: number): number {
  const proportional = from.length === to.length ? column : Math.round((column / Math.max(1, from.length - 1)) * (to.length - 1));
  return Math.max(0, Math.min(to.length - 1, proportional));
}

/** Arriba o abajo: fila a fila hasta dar con otro id (una tarjeta alta ocupa varias filas). */
function vertically(rows: string[][], rowIndex: number, column: number, current: string, dy: number): string {
  if (!dy) return current;
  for (let row = rowIndex, col = column; ;) {
    const nextRow = row + dy;
    if (nextRow < 0 || nextRow >= rows.length) return current;
    col = matchingColumn(rows[row]!, rows[nextRow]!, col);
    row = nextRow;
    if (rows[row]![col] !== current) return rows[row]![col]!;
  }
}

export const KEY_LEFT = ['ArrowLeft', 'KeyA', 'Numpad4'];
export const KEY_RIGHT = ['ArrowRight', 'KeyD', 'Numpad6'];
export const KEY_UP = ['ArrowUp', 'KeyW', 'Numpad8'];
export const KEY_DOWN = ['ArrowDown', 'KeyS', 'Numpad2'];
export const KEY_OK = ['Enter', 'NumpadEnter', 'Space'];
export const KEY_BACK = ['Escape', 'Backspace'];
