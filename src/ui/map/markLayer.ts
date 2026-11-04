import type Phaser from 'phaser';
import type { Pos } from '../../core/model';
import { TILE } from '../../layout';
import { PAL } from '../palette';
import { cornerBrackets, fillRects } from '../pixelDraw';
import { parseTileKey } from './geometry';
import { stepOf, type AnimatedLayer, type MapClock, type MapLayer } from './layer';
import type { ViewOptions } from './viewOptions';

/** Las marcas de mision se mueven a saltos: 2 pixeles cada MARK_STEP_MS. */
const MARK_STEP_MS = 500;
const MARK_JUMP = 2;
/** Esquinas del destino: largo, grueso y cuadrado oscuro de fondo. */
const GOAL_CORNER = 8;
const GOAL_THICK = 2;
const GOAL_BACK = 10;
/** Aro de seleccion: radios (parte de la casilla), puntos de la media elipse y altura sobre el borde de abajo. */
const RING_RX = 0.36;
const RING_RY = 0.13;
const RING_DOTS = 32;
const RING_LIFT = 8;
/** La flecha sobre la unidad a escoltar, por encima de su casilla. */
const VIP_LIFT = 10;

/**
 * Marcas por encima de las unidades: destino de la mision (esquinas doradas), flecha sobre la unidad
 * a escoltar (las dos se mueven a saltos) y [CAMBIO] aro a los pies de las unidades elegidas.
 */
export class MarkLayer implements MapLayer, AnimatedLayer {
  readonly object: Phaser.GameObjects.Graphics;
  private goal: Pos | null = null;
  private vip: Pos | null = null;
  /** [CAMBIO] Casillas de las unidades elegidas (aro a los pies). */
  private rings: [number, number][] = [];
  private phase = 0;

  constructor(scene: Phaser.Scene) {
    this.object = scene.add.graphics();
  }

  /** Toma lo que hay que marcar y lo dibuja en el primer paso. */
  set(opts: ViewOptions): void {
    this.goal = opts.goal ?? null;
    this.vip = opts.vip ?? null;
    this.rings = [...opts.highlights].filter(([, k]) => k === 'group').map(([k]) => parseTileKey(k));
    this.draw(0);
  }

  tick(clock: MapClock): void {
    const phase = stepOf(clock, MARK_STEP_MS, 2);
    if (phase === this.phase) return;
    this.phase = phase;
    if (this.goal || this.vip) this.draw(phase);
  }

  private draw(phase: number): void {
    const g = this.object;
    g.clear();
    // [CAMBIO] Elegidas: aro a los pies (la mitad de delante, por encima del dibujo de la unidad).
    for (const [x, y] of this.rings) drawRing(g, x * TILE + TILE / 2, y * TILE + TILE - RING_LIFT);
    if (this.goal) {
      const d = phase ? MARK_JUMP : 0;
      const x = this.goal.x * TILE - d,
        y = this.goal.y * TILE - d,
        w = TILE + 2 * d;
      const far = w - GOAL_BACK + 1;
      fillRects(g, PAL.ink, 0.8, [
        [x - 1, y - 1, GOAL_BACK, GOAL_BACK],
        [x + far, y - 1, GOAL_BACK, GOAL_BACK],
        [x - 1, y + far, GOAL_BACK, GOAL_BACK],
        [x + far, y + far, GOAL_BACK, GOAL_BACK],
      ]);
      // Esquinas en L del cursor.
      g.fillStyle(PAL.gold, 1);
      cornerBrackets(g, x, y, w, w, GOAL_CORNER, GOAL_THICK);
    }
    if (this.vip) {
      // Flecha hacia abajo de tres escalones, con borde oscuro.
      const cx = this.vip.x * TILE + TILE / 2,
        top = this.vip.y * TILE - VIP_LIFT - (phase ? MARK_JUMP : 0);
      fillRects(g, PAL.ink, 1, [
        [cx - 6, top - 1, 12, 5],
        [cx - 4, top + 4, 8, 3],
        [cx - 2, top + 7, 4, 3],
      ]);
      fillRects(g, PAL.gold, 1, [
        [cx - 5, top, 10, 3],
        [cx - 3, top + 3, 6, 2],
        [cx - 1, top + 5, 2, 3],
      ]);
    }
  }
}

/** Aro de seleccion (media elipse de pixeles, la de delante) centrado en (cx, cy). */
function drawRing(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  const rx = Math.round(TILE * RING_RX),
    ry = Math.round(TILE * RING_RY);
  const dots = new Set<string>();
  // Solo la mitad de delante: la de detras quedaria tapada por la unidad.
  for (let i = 0; i <= RING_DOTS; i++) {
    const a = (i / RING_DOTS) * Math.PI;
    dots.add(`${Math.round(cx + Math.cos(a) * rx)},${Math.round(cy + Math.sin(a) * ry)}`);
  }
  for (const [color, d] of [
    [PAL.ink, 1],
    [PAL.gold, 0],
  ] as const) {
    g.fillStyle(color, 0.9);
    for (const k of dots) {
      const [x, y] = parseTileKey(k);
      g.fillRect(x - 1, y - 1 + d, 2, 2);
    }
  }
}
