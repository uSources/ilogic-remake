import type Phaser from 'phaser';
import { hasImage } from '../../atlas';
import type { TurnEndOrderKind, Pos } from '../../core/model';
import { TILE } from '../../layout';
import { PAL, PAL_MAP } from '../palette';
import { cornerBrackets, fillRects } from '../pixelDraw';
import { tileCenter } from './geometry';
import type { OverlayPainter } from './layer';

/** Color de la bandera de cada orden en su casilla de destino. */
const COMMAND_FLAG: Record<TurnEndOrderKind, number> = { attack: PAL.red, capture: PAL.gold, defend: PAL_MAP.mint };
/** Linea de una orden: un punto de 3x3 cada ORDER_DOT_STEP pixeles. */
const ORDER_DOT_STEP = 8;

/**
 * Flecha pixel: tramo con borde oscuro (8 px) y relleno (4 px), y punta de lineas de 1 px. El ultimo
 * tramo se acorta para dejar sitio a la punta; `head` = largo de la punta y `back` = donde empieza.
 */
const ARROW_PASSES = [
  { w: 8, head: 8, back: -7, border: true },
  { w: 4, head: 6, back: -5, border: false },
] as const;
const ARROW_CUT = 6;
/** Flechas: camino previsto (blanca o roja si se ataca) e intenciones de las ordenes. */
const PATH_ARROW = { color: PAL.white, attack: PAL_MAP.redSoft, alpha: 1, border: 0.7 };
const INTENT_ARROW = { color: PAL_MAP.intent, alpha: 0.6, border: 0.4 };

/** Marco de objetivo: largo de las esquinas del color (el borde oscuro, 2 mas). */
const TARGET_CORNER = 7;

/** Ordenes de varios turnos: puntos cada 8 px (primero en horizontal, luego en vertical) y banderita. */
export const orderLines: OverlayPainter = (graphics, options, context) => {
  // El banderin dibujado (ui/flag_cmd_*) va en map/flagLayer.ts; este de pixeles solo si falta en el atlas.
  const orderArt = hasImage(context.textures, 'ui/flag_cmd_go');
  for (const order of options.orders ?? []) {
    const from = tileCenter(order.from);
    const to = tileCenter(order.to);
    const color = order.kind ? COMMAND_FLAG[order.kind] : PAL.gold;
    if (!order.kind || order.line) {
      graphics.fillStyle(color, 0.9);
      for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += ORDER_DOT_STEP) graphics.fillRect(x - 1, from.y - 1, 3, 3);
      for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += ORDER_DOT_STEP) graphics.fillRect(to.x - 1, y - 1, 3, 3);
    }
    if (!orderArt) drawPixelFlag(graphics, to, color);
  }
};

/** Banderita de pixeles (mastil y paño del color de la orden) con el pie en `foot`. */
function drawPixelFlag(graphics: Phaser.GameObjects.Graphics, foot: { x: number; y: number }, color: number): void {
  const { x, y } = foot;
  fillRects(graphics, PAL.ink, 1, [
    [x - 1, y - 12, 3, 14],
    [x + 1, y - 13, 10, 8],
  ]);
  fillRects(graphics, color, 1, [[x + 2, y - 12, 8, 6]]);
  fillRects(graphics, PAL_MAP.paleGold, 1, [[x, y - 11, 1, 12]]);
}

/** [CAMBIO] Intenciones de las ordenes con destino: lo que hara cada unidad al terminar el turno. */
export const intents: OverlayPainter = (graphics, options) => {
  for (const intent of options.intents ?? []) {
    if (intent.path.length > 1) drawArrow(graphics, intent.path, INTENT_ARROW.color, INTENT_ARROW.alpha, INTENT_ARROW.border);
    if (intent.attack) drawTargetMark(graphics, intent.attack, PAL.red);
    if (intent.capture) drawTargetMark(graphics, intent.capture, PAL.gold);
  }
};

/**
 * Camino previsto: flecha pixel (tramos de 4 px con borde oscuro y punta), como en Advance Wars.
 * [CAMBIO] Si al soltar ahi se ataca, la flecha va en rojo.
 */
export const pathArrow: OverlayPainter = (graphics, options) => {
  const path = options.path;
  if (path && path.length > 1)
    drawArrow(graphics, path, options.pathAttack ? PATH_ARROW.attack : PATH_ARROW.color, PATH_ARROW.alpha, PATH_ARROW.border);
};

/** Direccion de un paso: -1, 0 o 1 en cada eje. */
type Step = { dx: number; dy: number };

/**
 * Rectangulo de un tramo de flecha de `width` px entre los centros de dos casillas vecinas en linea.
 * `cutToward`: es el ultimo tramo y se acorta por ese lado para dejar sitio a la punta.
 */
function arrowSegment(from: Pos, to: Pos, width: number, cutToward: Step | null): { x: number; y: number; w: number; h: number } {
  let x = Math.min(from.x, to.x) * TILE + TILE / 2 - width / 2;
  let y = Math.min(from.y, to.y) * TILE + TILE / 2 - width / 2;
  let boxWidth = Math.abs(from.x - to.x) * TILE + width;
  let boxHeight = Math.abs(from.y - to.y) * TILE + width;
  if (!cutToward) return { x, y, w: boxWidth, h: boxHeight };
  const { dx, dy } = cutToward;
  if (dx > 0) boxWidth -= ARROW_CUT;
  if (dx < 0) {
    x += ARROW_CUT;
    boxWidth -= ARROW_CUT;
  }
  if (dy > 0) boxHeight -= ARROW_CUT;
  if (dy < 0) {
    y += ARROW_CUT;
    boxHeight -= ARROW_CUT;
  }
  return { x, y, w: boxWidth, h: boxHeight };
}

/** Punta: triangulo hecho de lineas de 1 px en `tip`, mirando en la direccion del ultimo paso. */
function drawArrowHead(
  graphics: Phaser.GameObjects.Graphics,
  tip: { x: number; y: number },
  step: Step,
  pass: (typeof ARROW_PASSES)[number],
): void {
  for (let i = 0; i <= pass.head; i++) {
    const half = pass.head - i;
    const along = pass.back + i;
    if (step.dx !== 0) graphics.fillRect(tip.x + step.dx * along, tip.y - half, 1, half * 2 + 1);
    else graphics.fillRect(tip.x - half, tip.y + step.dy * along, half * 2 + 1, 1);
  }
}

/** Flecha pixel por un camino: tramos de 4 px del color, con borde oscuro de 8 px, y punta. */
function drawArrow(graphics: Phaser.GameObjects.Graphics, path: readonly Pos[], color: number, alpha: number, borderAlpha: number): void {
  const end = path[path.length - 1]!;
  const beforeEnd = path[path.length - 2]!;
  const lastStep: Step = { dx: Math.sign(end.x - beforeEnd.x), dy: Math.sign(end.y - beforeEnd.y) };
  const tip = tileCenter(end);
  for (const pass of ARROW_PASSES) {
    graphics.fillStyle(pass.border ? PAL.ink : color, pass.border ? borderAlpha : alpha);
    for (let i = 0; i < path.length - 1; i++) {
      const isLast = i === path.length - 2;
      const segment = arrowSegment(path[i]!, path[i + 1]!, pass.w, isLast ? lastStep : null);
      graphics.fillRect(segment.x, segment.y, segment.w, segment.h);
    }
    drawArrowHead(graphics, tip, lastStep, pass);
  }
}

/** Marco de objetivo: primero el borde oscuro (mas grueso y largo) y encima el color. */
const TARGET_LAYERS = [
  { inset: 1, thickness: 4, isBorder: true, alpha: 0.75 },
  { inset: 2, thickness: 2, isBorder: false, alpha: 1 },
] as const;

/** Marco de esquinas sobre una casilla (objetivo de ataque o edificio a capturar), con borde oscuro. */
function drawTargetMark(graphics: Phaser.GameObjects.Graphics, pos: Pos, color: number): void {
  const left = pos.x * TILE;
  const top = pos.y * TILE;
  for (const { inset, thickness, isBorder, alpha } of TARGET_LAYERS) {
    graphics.fillStyle(isBorder ? PAL.ink : color, alpha);
    const length = TARGET_CORNER + (isBorder ? 2 : 0);
    cornerBrackets(graphics, left + inset, top + inset, TILE - 2 * inset, TILE - 2 * inset, length, thickness);
  }
}
