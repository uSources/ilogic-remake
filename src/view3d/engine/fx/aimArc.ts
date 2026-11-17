/**
 * El visor de un disparo en arco (la artilleria, como el de Tactics Ogre): una curva de puntitos de
 * pixel de la boca del que dispara al blanco, con un brillo que corre hacia el. Puntos amarillos sobre
 * otros de tinta algo mayores, para que se lean sobre la nieve y la arena. Solo dibuja.
 */
import * as THREE from 'three';
import { INK_COLOR } from './markParts';
import { PixelPoints } from './pixelPoints';

const DOTS = 26;
/** Tamaño de los puntitos (casillas: de cerca se ven mas grandes) y cuanto mayor es su sombra de tinta. */
const DOT_SIZE = 0.11;
const INK_GROWTH = 1.7;
const DOT_COLOR = 0xffd447;
/** Altura del arco: un poco, mas lo que se alarga el tiro (casillas). */
const PEAK_BASE = 0.6;
const PEAK_PER_TILE = 0.3;
/** Lo que tarda el brillo en ir de un extremo al otro (segundos) y lo que se apaga lo demas. */
const SWEEP_SECONDS = 0.9;
const DIM_ALPHA = 0.8;
/** Lo largo que es el brillo (en fraccion del arco). */
const GLOW_WIDTH = 0.18;

export class AimArc {
  readonly object = new THREE.Group();
  private readonly ink = new PixelPoints(DOTS);
  private readonly dots = new PixelPoints(DOTS);
  private time = 0;

  constructor() {
    this.ink.setLook(INK_COLOR, 1);
    this.dots.setLook(DOT_COLOR, 1);
    // Primero la tinta y encima los puntitos.
    this.ink.object.renderOrder = 20;
    this.dots.object.renderOrder = 21;
    this.object.add(this.ink.object, this.dots.object);
    this.object.visible = false;
  }

  /** Enseña el arco de `from` a `to` (puntos del mundo); null lo quita. */
  show(from: THREE.Vector3 | null, to: THREE.Vector3 | null): void {
    this.object.visible = !!from && !!to;
    if (!from || !to) return;
    const peak = PEAK_BASE + from.distanceTo(to) * PEAK_PER_TILE;
    for (let index = 0; index < DOTS; index++) {
      const along = index / (DOTS - 1);
      const point = from.clone().lerp(to, along);
      point.y += peak * 4 * along * (1 - along);
      this.ink.positions.set([point.x, point.y, point.z], index * 3);
      this.dots.positions.set([point.x, point.y, point.z], index * 3);
    }
    this.time = 0;
  }

  /** Un fotograma: el brillo avanza y los puntos se ajustan a la pantalla. */
  update(seconds: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    if (!this.object.visible) return;
    this.time += seconds;
    const glowAt = (this.time / SWEEP_SECONDS) % 1;
    for (let index = 0; index < DOTS; index++) {
      const along = index / (DOTS - 1);
      const glow = Math.max(0, 1 - Math.abs(along - glowAt) / GLOW_WIDTH);
      const size = DOT_SIZE * (1 + glow * 0.5);
      this.dots.alphas[index] = DIM_ALPHA + (1 - DIM_ALPHA) * glow;
      this.dots.sizes[index] = size;
      this.ink.alphas[index] = 1;
      this.ink.sizes[index] = size * INK_GROWTH;
    }
    for (const points of [this.ink, this.dots]) {
      points.setScale(viewportHeight, camera);
      points.commit();
    }
  }
}
