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
 * arriba no cabe (ni tapando la barra de arriba), va debajo y el tallo baja. Si tapa alguna casilla
 * de `avoid` (los enemigos a tiro), prueba sus otros sitios, aunque tenga que moverse un poco para
 * caber. Todo en px de la interfaz (ya divididos por la escala).
 */
export function placeCallout(tile: Anchor, box: Size, screen: Size, avoid: readonly Anchor[] = []): CalloutPlacement {
  const preferred = placeAt(tile, box, screen, preferredSpot(tile, box, screen));
  if (!coversAny(preferred, box, avoid)) return preferred;
  const free = CALLOUT_SPOTS.filter((spot) => fitsVertically(tile, box, screen, spot.vertical))
    .map((spot) => placeAt(tile, box, screen, spot))
    .find((placed) => !coversAny(placed, box, avoid));
  return free ?? preferred;
}

/** Un punto de la interfaz (px ya divididos por la escala). */
export interface Point {
  x: number;
  y: number;
}

/** Lo que se aparta una ficha del centro del abanico. */
export interface Offset {
  dx: number;
  dy: number;
}

/** El abanico ya colocado: su centro (el del edificio, o movido para que quepa) y donde va cada ficha. */
export interface Fan {
  center: Point;
  slots: Offset[];
}

/** Lo minimo que se aparta una ficha del centro: deja ver el edificio. */
const FAN_MIN_RADIUS = 92;
/** Lo mas que se abre la vuelta entera, y de cuanto en cuanto, buscando que no se pisen. */
const FAN_MAX_RADIUS = 360;
const FAN_GROW = 4;
/** Hueco entre una ficha y la siguiente (por el arco). */
const FAN_GAP = 8;
/** Lo mas abierto que va un abanico (radianes); con mas fichas, la vuelta entera. */
const FAN_MAX_SPREAD = Math.PI;
/** Hacia donde se abre, por orden de preferencia: arriba, arriba a los lados, a los lados, abajo. */
const FAN_FACINGS = [-0.5, -0.25, -0.75, 0, 1, 0.25, 0.75, 0.5].map((turn) => turn * Math.PI);

/** Lo que se sale de la pantalla una ficha de tamaño `slot` con centro en `at` (0 si cabe). */
function overflowOf(at: Point, slot: Size, screen: Size): number {
  const left = MARGIN - (at.x - slot.width / 2);
  const right = at.x + slot.width / 2 - (screen.width - MARGIN);
  const top = MARGIN - (at.y - slot.height / 2);
  const bottom = at.y + slot.height / 2 - (screen.height - MARGIN);
  return Math.max(0, left) + Math.max(0, right) + Math.max(0, top) + Math.max(0, bottom);
}

/** Las fichas en arco alrededor de `facing` (o la vuelta entera si `step` lo llena), a `radius`. */
function arcSlots(count: number, facing: number, step: number, radius: number): Offset[] {
  const first = facing - (step * (count - 1)) / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = first + step * index;
    return { dx: Math.round(Math.cos(angle) * radius), dy: Math.round(Math.sin(angle) * radius) };
  });
}

const totalOverflow = (center: Point, slots: readonly Offset[], slot: Size, screen: Size): number =>
  slots.reduce((sum, { dx, dy }) => sum + overflowOf({ x: center.x + dx, y: center.y + dy }, slot, screen), 0);

/**
 * Las `count` fichas de la compra en abanico alrededor de `center` (el edificio), sin pisarse: hacia
 * arriba si caben, si no hacia donde quepan (se gira hacia dentro cerca de un borde). Si son muchas,
 * la vuelta entera, y si esa no cabe, el centro se mueve lo justo hacia dentro. En px de la interfaz.
 */
export function fanAround(center: Point, count: number, slot: Size, screen: Size): Fan {
  // De centro a centro, lo que mide la ficha por su lado mayor y el hueco (en diagonal, se abre el radio).
  const pitch = Math.max(slot.width, slot.height) + FAN_GAP;
  const step = 2 * Math.asin(Math.min(1, pitch / (2 * FAN_MIN_RADIUS)));
  const isRing = step * (count - 1) > FAN_MAX_SPREAD;
  if (isRing) return ringAround(center, count, pitch, slot, screen);
  let radius = FAN_MIN_RADIUS;
  while (anyOverlap(arcSlots(count, FAN_FACINGS[0]!, step, radius), slot) && radius < FAN_MAX_RADIUS) radius += FAN_GROW;
  const fans = FAN_FACINGS.map((facing) => arcSlots(count, facing, step, radius));
  const fitting = fans.find((slots) => totalOverflow(center, slots, slot, screen) === 0);
  const best = fitting ?? minByOverflow(fans, (slots) => totalOverflow(center, slots, slot, screen));
  return { center, slots: best };
}

/** La vuelta entera, con el radio que haga falta para que no se pisen, y el centro movido para que quepa. */
function ringAround(center: Point, count: number, pitch: number, slot: Size, screen: Size): Fan {
  const step = (2 * Math.PI) / count;
  // La primera, arriba; las demas, en el sentido de las agujas del reloj (como la rueda).
  const ringAt = (radius: number) => arcSlots(count, FAN_FACINGS[0]! + (step * (count - 1)) / 2, step, radius);
  // Desde lo justo por la cuerda, se abre hasta que ninguna ficha (rectangular) pisa a otra.
  let radius = Math.max(FAN_MIN_RADIUS, pitch / (2 * Math.sin(Math.PI / count)));
  while (anyOverlap(ringAt(radius), slot) && radius < FAN_MAX_RADIUS) radius += FAN_GROW;
  const slots = ringAt(radius);
  const reach = { x: radius + slot.width / 2 + MARGIN, y: radius + slot.height / 2 + MARGIN };
  const inside = (value: number, low: number, high: number): number =>
    low > high ? (low + high) / 2 : Math.max(low, Math.min(high, value));
  const moved = {
    x: Math.round(inside(center.x, reach.x, screen.width - reach.x)),
    y: Math.round(inside(center.y, reach.y, screen.height - reach.y)),
  };
  return { center: moved, slots };
}

/** Dos fichas de tamaño `slot` se pisan (por sus centros). */
function anyOverlap(slots: readonly Offset[], slot: Size): boolean {
  return slots.some((a, index) =>
    slots
      .slice(index + 1)
      .some((b) => Math.abs(a.dx - b.dx) < slot.width + FAN_GAP / 2 && Math.abs(a.dy - b.dy) < slot.height + FAN_GAP / 2),
  );
}

function minByOverflow<T>(options: readonly T[], cost: (option: T) => number): T {
  return options.reduce((best, option) => (cost(option) < cost(best) ? option : best));
}
