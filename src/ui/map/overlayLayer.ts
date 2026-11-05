import type Phaser from 'phaser';
import { TILE } from '../../layout';
import { PAL_MAP } from '../palette';
import { captureBars, highlights } from './highlights';
import type { MapLayer, OverlayContext, OverlayPainter } from './layer';
import { intents, orderLines, pathArrow } from './orders';
import type { ViewOptions } from './viewOptions';
import { attackZone, controlZones, dangerCorners, threatZone } from './zones';

/** Niebla del dibujo de 2013: velo oscuro por casilla que no se ve (la nueva va en map/fogLayer.ts). */
const classicFog: OverlayPainter = (graphics, options, context) => {
  if (context.newArt) return;
  graphics.fillStyle(PAL_MAP.fog, 0.5);
  options.vis.forEach((isVisible, { x, y }) => {
    if (!isVisible) graphics.fillRect(x * TILE, y * TILE, TILE, TILE);
  });
};

/**
 * Orden de dibujo de la capa de resaltados (de abajo arriba). Para añadir una marca nueva sobre
 * el mapa, una funcion mas en su sitio de la lista.
 */
export const OVERLAYS: readonly OverlayPainter[] = [
  classicFog,
  controlZones,
  threatZone,
  highlights,
  captureBars,
  attackZone,
  dangerCorners,
  orderLines,
  intents,
  pathArrow,
];

/** Capa de resaltados: un Graphics por encima de los edificios y la niebla, debajo de las unidades. */
export class OverlayLayer implements MapLayer {
  readonly object: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly painters: readonly OverlayPainter[] = OVERLAYS,
  ) {
    this.object = scene.add.graphics();
  }

  draw(options: ViewOptions, context: OverlayContext): void {
    const graphics = this.object;
    graphics.clear();
    for (const paint of this.painters) paint(graphics, options, context);
  }
}
