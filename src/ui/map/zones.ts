import type Phaser from 'phaser';
import { hasImage } from '../../atlas';
import { TILE } from '../../layout';
import { PAL } from '../palette';
import { fillRects } from '../pixelDraw';
import { sideColor } from '../sides';
import { posKey } from '../../core/geom';
import type { Pos } from '../../core/model';
import type { Grid } from '../../core/util/grid';
import { parseTileKey } from './geometry';
import type { OverlayPainter } from './layer';

/** Grueso del borde de una zona (amenaza, alcance) y del de puntos de un punto de control. */
const ZONE_EDGE = 2;
/** Separacion de los puntos del borde de un punto de control (y de las rayas si esta disputado). */
const DOT_STEP = 4;

/**
 * Zona de casillas: relleno suave y borde de 2 px por la parte de fuera de la zona. `fillIf` deja
 * sin rellenar algunas casillas de la zona (el borde se dibuja igual).
 */
function drawZone(
  graphics: Phaser.GameObjects.Graphics,
  zone: Grid<boolean>,
  color: number,
  fillAlpha: number,
  edgeAlpha: number,
  fillIf: (pos: Pos) => boolean = () => true,
): void {
  const at = (pos: Pos) => zone.contains(pos) && zone.at(pos);
  graphics.fillStyle(color, fillAlpha);
  zone.forEach((inZone, pos) => {
    if (inZone && fillIf(pos)) graphics.fillRect(pos.x * TILE, pos.y * TILE, TILE, TILE);
  });
  graphics.fillStyle(color, edgeAlpha);
  zone.forEach((inZone, { x, y }) => {
    if (!inZone) return;
    const px = x * TILE,
      py = y * TILE;
    if (!at({ x, y: y - 1 })) graphics.fillRect(px, py, TILE, ZONE_EDGE);
    if (!at({ x, y: y + 1 })) graphics.fillRect(px, py + TILE - ZONE_EDGE, TILE, ZONE_EDGE);
    if (!at({ x: x - 1, y })) graphics.fillRect(px, py, ZONE_EDGE, TILE);
    if (!at({ x: x + 1, y })) graphics.fillRect(px + TILE - ZONE_EDGE, py, ZONE_EDGE, TILE);
  });
}

/**
 * [CAMBIO] Puntos de control: la zona teñida del color de su dueño (gris si no es de nadie), con
 * borde de puntos, y un banderin en el centro. Disputada: borde de rayas rojas y doradas.
 */
export const controlZones: OverlayPainter = (graphics, options, context) => {
  const flagArt = hasImage(context.textures, 'ui/flag_b');
  for (const point of options.controlPoints ?? []) {
    const x0 = Math.max(0, point.x - point.r) * TILE,
      y0 = Math.max(0, point.y - point.r) * TILE,
      x1 = Math.min(options.vis.width, point.x + point.r + 1) * TILE,
      y1 = Math.min(options.vis.height, point.y + point.r + 1) * TILE;
    const color = sideColor(point.owner);
    graphics.fillStyle(color, 0.16);
    graphics.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let i = 0; i < Math.max(x1 - x0, y1 - y0); i += DOT_STEP) {
      graphics.fillStyle(point.contested ? (i % (2 * DOT_STEP) ? PAL.gold : PAL.red) : color, 0.95);
      if (x0 + i < x1) {
        graphics.fillRect(x0 + i, y0, ZONE_EDGE, ZONE_EDGE);
        graphics.fillRect(x0 + i, y1 - ZONE_EDGE, ZONE_EDGE, ZONE_EDGE);
      }
      if (y0 + i < y1) {
        graphics.fillRect(x0, y0 + i, ZONE_EDGE, ZONE_EDGE);
        graphics.fillRect(x1 - ZONE_EDGE, y0 + i, ZONE_EDGE, ZONE_EDGE);
      }
    }
    // El banderin dibujado (ui/flag_*) va en map/flagLayer.ts; este de pixeles solo si falta en el atlas.
    if (flagArt) continue;
    // Mastil y banderin triangular con borde oscuro, arriba a la izquierda de la casilla central.
    const x = point.x * TILE,
      y = point.y * TILE;
    fillRects(graphics, PAL.ink, 1, [
      [x + 3, y + 3, 3, 14],
      [x + 5, y + 3, 9, 8],
    ]);
    fillRects(graphics, PAL.white, 1, [[x + 4, y + 4, 1, 12]]);
    graphics.fillStyle(point.contested ? PAL.gold : color, 1);
    for (let row = 0; row < 6; row++) graphics.fillRect(x + 6, y + 4 + row, 7 - Math.abs(row - 2.5) * 2, 1);
  }
};

/** Zona de amenaza enemiga (tecla T): relleno rojo suave y borde de 2 px por fuera de la zona. */
export const threatZone: OverlayPainter = (graphics, options) => {
  if (options.threat) drawZone(graphics, options.threat, PAL.red, 0.2, 0.9);
};

/** Alcance de ataque al mover: relleno rojo tenue fuera del movimiento y borde de la zona. */
export const attackZone: OverlayPainter = (graphics, options) => {
  if (options.attackZone) drawZone(graphics, options.attackZone, PAL.red, 0.14, 0.85, (pos) => !options.highlights.has(posKey(pos)));
};

/** Destinos peligrosos (el enemigo visible podria atacar ahi): esquina roja arriba a la derecha. */
export const dangerCorners: OverlayPainter = (graphics, options) => {
  const dg = options.danger;
  if (!dg) return;
  for (const [key, kind] of options.highlights) {
    if (kind !== 'move') continue;
    const [x, y] = parseTileKey(key);
    if (!dg.at({ x, y })) continue;
    const px = x * TILE + TILE - 9,
      py = y * TILE + 3;
    fillRects(graphics, PAL.ink, 0.8, [[px - 1, py - 1, 8, 8]]);
    graphics.fillStyle(PAL.red, 1);
    for (let i = 0; i < 6; i++) {
      graphics.fillRect(px + i, py, 6 - i, 1);
      graphics.fillRect(px + i, py + i, 1, 1);
    }
    graphics.fillRect(px, py, 6, 2);
    graphics.fillRect(px + 4, py, 2, 6);
  }
};
