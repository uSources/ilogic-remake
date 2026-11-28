import type { Anchor } from '../vm/common';

/** Distancia minima a los bordes de la pantalla. */
const MARGIN = 16;
/** Por arriba, ademas, que no tape la barra de arriba (si la pantalla es lo bastante alta). */
const TOP_SAFE = 80;

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

/** Encima si cabe; si no, debajo si cabe; y si no cabe de ninguna forma, donde haya mas sitio (luego se encoge y se desplaza dentro). */
function calloutVertical(tile: Anchor, box: Size, screen: Size): CalloutPlacement['vertical'] {
  const minTop = Math.min(TOP_SAFE, screen.height - MARGIN - box.height);
  const roomAbove = tile.y - STEM - minTop;
  const roomBelow = screen.height - MARGIN - (tile.y + tile.h + STEM);
  if (roomAbove >= box.height) return 'above';
  if (roomBelow >= box.height) return 'below';
  return roomAbove >= roomBelow ? 'above' : 'below';
}

/** Los cuatro sitios de un bocadillo con tallo, por orden de preferencia: encima y despues debajo, a la derecha y a la izquierda. */
type CalloutSpot = Pick<CalloutPlacement, 'vertical' | 'side'>;

const CALLOUT_SPOTS: readonly CalloutSpot[] = [
  { vertical: 'above', side: 'right' },
  { vertical: 'above', side: 'left' },
  { vertical: 'below', side: 'right' },
  { vertical: 'below', side: 'left' },
];

/** Cabe encima (sin tapar la barra de arriba, si la pantalla es lo bastante alta) o debajo de la casilla. */
function fitsVertically(tile: Anchor, box: Size, screen: Size, vertical: CalloutSpot['vertical']): boolean {
  const minTop = Math.min(TOP_SAFE, screen.height - MARGIN - box.height);
  return vertical === 'above' ? tile.y - STEM - box.height >= minTop : tile.y + tile.h + STEM + box.height <= screen.height - MARGIN;
}

/** Donde va si no hay nada que evitar: encima o debajo como siempre, y a la derecha si cabe (si no, a la izquierda). */
const preferredSpot = (tile: Anchor, box: Size, screen: Size): CalloutSpot => ({
  vertical: calloutVertical(tile, box, screen),
  side: tile.x + tile.w / 2 + box.width <= screen.width - MARGIN ? 'right' : 'left',
});

/** El bocadillo en ese sitio, movido lo justo para no salirse de la pantalla, con su tallo hasta la casilla. */
function placeAt(tile: Anchor, box: Size, screen: Size, spot: CalloutSpot): CalloutPlacement {
  const stemX = tile.x + tile.w / 2;
  const left = spot.side === 'right' ? stemX : stemX - box.width;
  const top = spot.vertical === 'above' ? tile.y - STEM - box.height : tile.y + tile.h + STEM;
  const card = keepOnScreen(left, top, box, screen);
  return { ...card, ...spot, stem: stemBetween(tile, card, box, spot.vertical) };
}

/** Tapa alguna de esas casillas. */
function coversAny(card: Placement, box: Size, avoid: readonly Anchor[]): boolean {
  return avoid.some(
    (spot) => card.left < spot.x + spot.w && card.left + box.width > spot.x && card.top < spot.y + spot.h && card.top + box.height > spot.y,
  );
}

/**
 * Donde va un bocadillo con tallo (lienzo «Lo que sale de las casillas», A): el tallo sube de lo alto
 * de la casilla y el bocadillo se abre en su punta, a la derecha si cabe y si no a la izquierda. Si
 * arriba no cabe (ni tapando la barra de arriba), va debajo y el tallo baja. Si asi tapa algo de
 * `avoid` (los enemigos a tiro), va al primero de los otros sitios donde no lo tape: antes los que
 * caben por arriba o por abajo y despues los que caben movidos lo justo (sin tapar su casilla). De
 * lado siempre se mueve lo justo para no salirse: en el movil no cabe entero a ningun lado. Si no hay
 * ninguno, donde iba. Todo en px de la interfaz (ya divididos por la escala).
 */
export function placeCallout(tile: Anchor, box: Size, screen: Size, avoid: readonly Anchor[] = []): CalloutPlacement {
  const preferred = placeAt(tile, box, screen, preferredSpot(tile, box, screen));
  if (!coversAny(preferred, box, avoid)) return preferred;
  const fits = (spot: CalloutSpot) => fitsVertically(tile, box, screen, spot.vertical);
  const spots = [...CALLOUT_SPOTS.filter(fits), ...CALLOUT_SPOTS.filter((spot) => !fits(spot))];
  const free = spots.map((spot) => placeAt(tile, box, screen, spot)).find((placed) => !coversAny(placed, box, [...avoid, tile]));
  return free ?? preferred;
}
