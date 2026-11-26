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

/** Lo que sube el tallo desde la casilla hasta su bocadillo (o baja, si va debajo). */
const STEM = 44;

/** El tallo de un bocadillo: su x, donde empieza por arriba y su largo. */
export interface Stem {
  x: number;
  top: number;
  height: number;
}

/** Un bocadillo con tallo ya colocado: donde va, a que lado del tallo y si encima o debajo de la casilla. */
export interface CalloutPlacement extends Placement {
  side: 'right' | 'left';
  vertical: 'above' | 'below';
  stem: Stem;
}

/** El tallo, de la casilla al borde del bocadillo que le toca (el de abajo si va encima; el de arriba si va debajo). */
function stemBetween(tile: Anchor, card: Placement, box: Size, vertical: CalloutPlacement['vertical']): Stem {
  const x = Math.round(tile.x + tile.w / 2);
  if (vertical === 'above') {
    const cardBottom = card.top + box.height;
    return { x, top: cardBottom, height: Math.max(0, Math.round(tile.y - cardBottom)) };
  }
  const tileBottom = tile.y + tile.h;
  return { x, top: Math.round(tileBottom), height: Math.max(0, Math.round(card.top - tileBottom)) };
}

/**
 * Donde va un bocadillo con tallo (lienzo «Lo que sale de las casillas», A): el tallo sube de lo alto
 * de la casilla y el bocadillo se abre en su punta, a la derecha si cabe y si no a la izquierda. Si
 * arriba no cabe (ni tapando la barra de arriba), va debajo y el tallo baja. Todo en px de la
 * interfaz (ya divididos por la escala).
 */
export function placeCallout(tile: Anchor, box: Size, screen: Size): CalloutPlacement {
  const stemX = tile.x + tile.w / 2;
  const minTop = Math.min(TOP_SAFE, screen.height - MARGIN - box.height);
  const vertical = tile.y - STEM - box.height >= minTop ? 'above' : 'below';
  const side = stemX + box.width <= screen.width - MARGIN ? 'right' : 'left';
  const left = side === 'right' ? stemX : stemX - box.width;
  const top = vertical === 'above' ? tile.y - STEM - box.height : tile.y + tile.h + STEM;
  const card = keepOnScreen(left, top, box, screen);
  return { ...card, side, vertical, stem: stemBetween(tile, card, box, vertical) };
}
