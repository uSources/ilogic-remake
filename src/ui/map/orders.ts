import type Phaser from 'phaser';
import { hasImage } from '../../atlas';
import type { CommandKind, Pos } from '../../core/types';
import { TILE } from '../../layout';
import { PAL, PAL_MAP } from '../palette';
import { cornerBrackets, fillRects } from '../pixelDraw';
import { tileCenter } from './geometry';
import type { OverlayPainter } from './layer';

/** Color de la bandera de cada orden en su casilla de destino. */
const COMMAND_FLAG: Record<CommandKind, number> = { attack: PAL.red, capture: PAL.gold, defend: PAL_MAP.mint };
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
export const orderLines: OverlayPainter = (g, opts, ctx) => {
  // El banderin dibujado (ui/flag_cmd_*) va en map/flagLayer.ts; este de pixeles solo si falta en el atlas.
  const orderArt = hasImage(ctx.textures, 'ui/flag_cmd_go');
  for (const o of opts.orders ?? []) {
    const { x: ax, y: ay } = tileCenter(o.from),
      { x: bx, y: by } = tileCenter(o.to);
    const color = o.kind ? COMMAND_FLAG[o.kind] : PAL.gold;
    if (!o.kind || o.line) {
      g.fillStyle(color, 0.9);
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x += ORDER_DOT_STEP) g.fillRect(x - 1, ay - 1, 3, 3);
      for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += ORDER_DOT_STEP) g.fillRect(bx - 1, y - 1, 3, 3);
    }
    if (orderArt) continue;
    fillRects(g, PAL.ink, 1, [
      [bx - 1, by - 12, 3, 14],
      [bx + 1, by - 13, 10, 8],
    ]);
    fillRects(g, color, 1, [[bx + 2, by - 12, 8, 6]]);
    fillRects(g, PAL_MAP.paleGold, 1, [[bx, by - 11, 1, 12]]);
  }
};

/** [CAMBIO] Intenciones de las ordenes con destino: lo que hara cada unidad al terminar el turno. */
export const intents: OverlayPainter = (g, opts) => {
  for (const it of opts.intents ?? []) {
    if (it.path.length > 1) drawArrow(g, it.path, INTENT_ARROW.color, INTENT_ARROW.alpha, INTENT_ARROW.border);
    if (it.attack) drawTargetMark(g, it.attack, PAL.red);
    if (it.capture) drawTargetMark(g, it.capture, PAL.gold);
  }
};

/**
 * Camino previsto: flecha pixel (tramos de 4 px con borde oscuro y punta), como en Advance Wars.
 * [CAMBIO] Si al soltar ahi se ataca, la flecha va en rojo.
 */
export const pathArrow: OverlayPainter = (g, opts) => {
  const path = opts.path;
  if (path && path.length > 1)
    drawArrow(g, path, opts.pathAttack ? PATH_ARROW.attack : PATH_ARROW.color, PATH_ARROW.alpha, PATH_ARROW.border);
};

/** Flecha pixel por un camino: tramos de 4 px del color, con borde oscuro de 8 px, y punta. */
function drawArrow(g: Phaser.GameObjects.Graphics, path: readonly Pos[], color: number, alpha: number, borderAlpha: number): void {
  const end = path[path.length - 1]!,
    before = path[path.length - 2]!;
  const dx = Math.sign(end.x - before.x),
    dy = Math.sign(end.y - before.y);
  const { x: cx, y: cy } = tileCenter(end);
  for (const pass of ARROW_PASSES) {
    const w = pass.w;
    g.fillStyle(pass.border ? PAL.ink : color, pass.border ? borderAlpha : alpha);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!,
        b = path[i + 1]!;
      // El ultimo tramo se queda antes del centro: ahi va la punta.
      const last = i === path.length - 2;
      let x0 = Math.min(a.x, b.x) * TILE + TILE / 2 - w / 2,
        y0 = Math.min(a.y, b.y) * TILE + TILE / 2 - w / 2;
      let ww = Math.abs(a.x - b.x) * TILE + w,
        hh = Math.abs(a.y - b.y) * TILE + w;
      if (last) {
        if (dx > 0) ww -= ARROW_CUT;
        if (dx < 0) {
          x0 += ARROW_CUT;
          ww -= ARROW_CUT;
        }
        if (dy > 0) hh -= ARROW_CUT;
        if (dy < 0) {
          y0 += ARROW_CUT;
          hh -= ARROW_CUT;
        }
      }
      g.fillRect(x0, y0, ww, hh);
    }
    // Punta: triangulo hecho de lineas de 1 px, mirando en la direccion del ultimo paso.
    for (let i = 0; i <= pass.head; i++) {
      const half = pass.head - i;
      const along = pass.back + i;
      if (dx !== 0) g.fillRect(cx + dx * along, cy - half, 1, half * 2 + 1);
      else g.fillRect(cx - half, cy + dy * along, half * 2 + 1, 1);
    }
  }
}

/** Marco de esquinas sobre una casilla (objetivo de ataque o edificio a capturar), con borde oscuro. */
function drawTargetMark(g: Phaser.GameObjects.Graphics, p: Pos, color: number): void {
  const px = p.x * TILE,
    py = p.y * TILE;
  for (const [inset, thick, c, a] of [
    [1, 4, PAL.ink, 0.75],
    [2, 2, color, 1],
  ] as const) {
    g.fillStyle(c, a);
    const len = TARGET_CORNER + (thick === 4 ? 2 : 0);
    cornerBrackets(g, px + inset, py + inset, TILE - 2 * inset, TILE - 2 * inset, len, thick);
  }
}
