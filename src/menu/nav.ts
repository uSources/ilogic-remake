/**
 * Navegacion con teclado por una rejilla de botones (filas de ids). Un mismo id puede ocupar varias
 * casillas (una tarjeta alta); al moverse se salta a la siguiente casilla con un id distinto.
 */
export function navGrid(rows: string[][], cur: string, dx: number, dy: number): string {
  let r = rows.findIndex((row) => row.includes(cur));
  if (r < 0) return rows[0]?.[0] ?? cur;
  let c = rows[r]!.indexOf(cur);
  if (dx) {
    const row = rows[r]!;
    // Saltar las casillas que repiten el mismo id.
    let i = c;
    if (dx > 0) while (i < row.length && row[i] === cur) i++;
    else while (i >= 0 && row[i] === cur) i--;
    return i >= 0 && i < row.length ? row[i]! : cur;
  }
  while (dy) {
    const nr = r + dy;
    if (nr < 0 || nr >= rows.length) return cur;
    const from = rows[r]!;
    const to = rows[nr]!;
    // Columna equivalente (por proporcion si las filas tienen distinto largo).
    const nc = from.length === to.length ? c : Math.round((c / Math.max(1, from.length - 1)) * (to.length - 1));
    r = nr;
    c = Math.max(0, Math.min(to.length - 1, nc));
    if (to[c] !== cur) return to[c]!;
  }
  return cur;
}

export const KEY_LEFT = ['ArrowLeft', 'KeyA', 'Numpad4'];
export const KEY_RIGHT = ['ArrowRight', 'KeyD', 'Numpad6'];
export const KEY_UP = ['ArrowUp', 'KeyW', 'Numpad8'];
export const KEY_DOWN = ['ArrowDown', 'KeyS', 'Numpad2'];
export const KEY_OK = ['Enter', 'NumpadEnter', 'Space'];
export const KEY_BACK = ['Escape', 'Backspace'];
