import { TILE } from '../../layout';
import { PAL, PAL_MAP } from '../palette';
import { frameRect } from '../pixelDraw';
import { sideColor } from '../sides';
import { parseTileKey } from './geometry';
import type { OverlayPainter } from './layer';
import type { HighlightKind } from './viewOptions';

/** Relleno y borde de cada clase de resaltado. */
const HL: Record<HighlightKind, { fill: number; alpha: number; line: number }> = {
  move: { fill: PAL.blue, alpha: 0.4, line: 0xcfe8ff },
  unload: { fill: PAL.blue, alpha: 0.4, line: 0xcfe8ff },
  merge: { fill: PAL_MAP.violet, alpha: 0.45, line: 0xe0b8ff },
  load: { fill: PAL_MAP.teal, alpha: 0.45, line: 0xa8fff6 },
  attack: { fill: PAL.red, alpha: 0.42, line: 0xffb0b2 },
  reach: { fill: PAL_MAP.orange, alpha: 0.32, line: 0xffc9a0 },
  hover: { fill: PAL.blue, alpha: 0.16, line: 0x8fd0ff },
  group: { fill: PAL.gold, alpha: 0.18, line: PAL.gold },
  // [CAMBIO] Compañeras de escuadra de la unidad señalada.
  squad: { fill: PAL.gold, alpha: 0.06, line: 0xffe9a8 },
};
/** Opacidad del borde de los resaltados. */
const HL_LINE_ALPHA = 0.75;

/** Barra de captura: separacion de los lados de la casilla, alto del relleno. */
const CAPTURE_INSET = 3;
const CAPTURE_H = 4;

/** Resaltados (bordes de 1 px dibujados con rectangulos para que queden nitidos). */
export const highlights: OverlayPainter = (g, opts) => {
  for (const [k, kind] of opts.highlights) {
    const [x, y] = parseTileKey(k);
    const st = HL[kind];
    const px = x * TILE,
      py = y * TILE;
    g.fillStyle(st.fill, st.alpha);
    g.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    g.fillStyle(st.line, HL_LINE_ALPHA);
    frameRect(g, px + 1, py + 1, TILE - 2, TILE - 2, 1, false);
  }
};

/** Barras de captura: fondo oscuro y relleno del color de quien captura. */
export const captureBars: OverlayPainter = (g, opts) => {
  for (const c of opts.captures ?? []) {
    const px = c.x * TILE + CAPTURE_INSET,
      py = c.y * TILE + 1;
    const w = TILE - 2 * CAPTURE_INSET;
    g.fillStyle(PAL.ink, 0.9);
    g.fillRect(px - 1, py - 1, w + 2, CAPTURE_H + 2);
    g.fillStyle(sideColor(c.side), 1);
    g.fillRect(px, py, Math.max(1, Math.round((w * (c.total - c.left)) / c.total)), CAPTURE_H);
  }
};
