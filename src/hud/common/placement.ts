import type { Anchor } from '../vm/common';

/** Distancia minima a los bordes de la pantalla. */
const MARGIN = 16;
/** Por arriba, ademas, que no tape la barra de arriba (si la pantalla es lo bastante alta). */
const TOP_SAFE = 80;
/** Separacion entre la casilla y el bocadillo. */
const GAP = 10;

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
}

/** Que el bocadillo no se salga de la pantalla (ni tape la barra de arriba, si cabe). */
function keepOnScreen(left: number, top: number, box: Size, screen: Size): Placement {
  const maxLeft = screen.width - MARGIN - box.width;
  const maxTop = screen.height - MARGIN - box.height;
  const minTop = Math.min(TOP_SAFE, maxTop);
  return { left: Math.round(Math.max(MARGIN, Math.min(maxLeft, left))), top: Math.round(Math.max(minTop, Math.min(maxTop, top))) };
}

/** Pantalla estrecha: centrado debajo de la casilla si cabe, si no encima. */
function aboveOrBelow(tile: Anchor, box: Size, screen: Size): Placement {
  const below = tile.y + tile.h + GAP;
  const fitsBelow = below + box.height <= screen.height - MARGIN;
  return { left: tile.x + tile.w / 2 - box.width / 2, top: fitsBelow ? below : tile.y - GAP - box.height };
}

/**
 * Donde va un bocadillo de tamaño `box` junto a la casilla `tile`: al lado que se prefiera si cabe,
 * si no al otro, y si no cabe a ninguno (pantalla estrecha), encima o debajo. Todo en px de la
 * interfaz (ya divididos por la escala).
 */
export function placeBeside(tile: Anchor, box: Size, screen: Size, prefer: 'right' | 'left'): Placement {
  const rightX = tile.x + tile.w + GAP;
  const leftX = tile.x - GAP - box.width;
  const fitsRight = rightX + box.width <= screen.width - MARGIN;
  const fitsLeft = leftX >= MARGIN;
  if (!fitsRight && !fitsLeft) {
    const { left, top } = aboveOrBelow(tile, box, screen);
    return keepOnScreen(left, top, box, screen);
  }
  const goesRight = prefer === 'right' ? fitsRight : !fitsLeft;
  const centeredTop = tile.y + tile.h / 2 - box.height / 2;
  return keepOnScreen(goesRight ? rightX : leftX, centeredTop, box, screen);
}
