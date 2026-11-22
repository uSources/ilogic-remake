/**
 * Las motas del ambiente: puntitos que salen de las casillas de su terreno cerca de lo que se mira,
 * viven un rato y se van (el polvo de la arena, las luciernagas, las hojas que caen). Cada clase es un
 * dato (`MoteKind`, en kinds.ts: cuantas, de que color, como vuelan y como brillan); aqui todas se
 * mueven y se dibujan igual, una bandada por clase. Con «reducir el movimiento» no salen.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import { PixelPoints } from '../fx/pixelPoints';
import { pointIn, type Range } from '../core/random';
import { Births, stepLife, type BirthPlan, type Mote } from './births';

export type { Mote } from './births';

/** Un punto de cada mota: el polvo lleva uno; la luciernaga, su halo y su nucleo. */
export interface MoteLayer {
  /** Sus colores: cada mota, uno de ellos (siempre el mismo). */
  colors: readonly THREE.ColorRepresentation[];
  opacity: number;
  /** Lo que mide (casillas): cada mota, lo suyo entre los dos. */
  size: Range;
  /** Si brilla: suma su luz a lo de detras y se apaga hacia el borde (`PixelPoints.glow`). */
  glow?: boolean;
}

export interface MoteKind extends BirthPlan {
  /** Como se dibuja cada una: un punto por capa, la primera debajo. */
  layers: readonly MoteLayer[];
  /** Donde esta a su edad (lo escribe en `out` y lo devuelve): su vuelo desde donde nacio. */
  flight(mote: Mote, out: THREE.Vector3): THREE.Vector3;
  /** Cuanto se ve a su edad (0 a 1). */
  brightness(mote: Mote): number;
  /** Que parte de lo suyo mide a su edad (0 a 1; sin decir, todo): la hoja que gira se estrecha y se ensancha. */
  scale?(mote: Mote): number;
}

/** Las semillas de `vary` desde aqui son del tamaño y del color de cada capa (las de antes, de las clases de kinds.ts). */
const LAYER_SIZE_SALT = 100;
const LAYER_COLOR_SALT = 200;

/** Un numero de `range` propio de esa mota: con la misma `salt`, siempre el mismo para ella. */
export function vary(mote: Mote, salt: number, range: Range): number {
  const value = Math.sin(mote.seed * 12.9898 + salt * 78.233) * 43758.5453;
  return pointIn(range, value - Math.floor(value));
}

/** Entra y sale despacio de su vida: nada de puntos que aparecen o desaparecen de golpe. */
export const lifeFade = (mote: Mote): number => Math.sin((mote.age / mote.life) * Math.PI);

/** Los puntos de una capa (el color lo pone cada mota). */
function pointsOf(layer: MoteLayer, count: number): PixelPoints {
  const points = new PixelPoints(count);
  points.setLook(0xffffff, layer.opacity);
  if (layer.glow) points.glow();
  return points;
}

/** Pone el punto `index`: donde, cuanto mide y cuanto se ve (sin sitio, no se ve). */
function setPoint(points: PixelPoints, index: number, at: THREE.Vector3 | null, size: number, brightness: number): void {
  points.alphas[index] = at ? brightness : 0;
  points.sizes[index] = at ? size : 0;
  if (!at) return;
  points.positions[index * 3] = at.x;
  points.positions[index * 3 + 1] = at.y;
  points.positions[index * 3 + 2] = at.z;
}

/** Pinta el punto `index` de un color. */
function setColor(points: PixelPoints, index: number, color: THREE.Color): void {
  points.colors[index * 3] = color.r;
  points.colors[index * 3 + 1] = color.g;
  points.colors[index * 3 + 2] = color.b;
}

/** Las motas de una clase sobre sus casillas. */
export class MoteSwarm {
  readonly object = new THREE.Group();
  private readonly layers: readonly PixelPoints[];
  /** Los colores de cada capa, ya hechos. */
  private readonly palettes: readonly (readonly THREE.Color[])[];
  private readonly motes: (Mote | null)[];
  private readonly births: Births;
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly kind: MoteKind,
    tiles: readonly Pos[],
    groundOf: (pos: Pos) => THREE.Vector3,
  ) {
    this.layers = kind.layers.map((layer) => pointsOf(layer, kind.count));
    this.palettes = kind.layers.map((layer) => layer.colors.map((color) => new THREE.Color(color)));
    this.motes = Array.from({ length: kind.count }, () => null);
    this.births = new Births(kind, tiles, groundOf);
    this.object.add(...this.layers.map((points) => points.object));
  }

  /** Avanza las motas cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.object.visible = this.births.tiles.length > 0 && !reducedMotion();
    if (!this.object.visible) return;
    for (const points of this.layers) points.setScale(viewportHeight, camera);
    this.births.tick(seconds, center, radius);
    this.motes.forEach((mote, index) => (this.motes[index] = stepLife(mote, seconds, this.births)));
    this.draw();
  }

  /** Va en cada fotograma por cada mota y cada capa: con bucles sencillos, sin crear nada (ni funciones). */
  private draw(): void {
    for (let index = 0; index < this.motes.length; index++) this.drawMote(index, this.motes[index] ?? null);
    for (const points of this.layers) points.commit();
  }

  private drawMote(index: number, mote: Mote | null): void {
    const at = mote && this.kind.flight(mote, this.at);
    const brightness = mote ? this.kind.brightness(mote) : 0;
    const scale = mote && this.kind.scale ? this.kind.scale(mote) : 1;
    for (let layer = 0; layer < this.layers.length; layer++) {
      const points = this.layers[layer]!;
      setPoint(points, index, at, mote ? this.sizeOf(mote, layer) * scale : 0, brightness);
      if (mote) setColor(points, index, this.colorOf(mote, layer));
    }
  }

  private sizeOf(mote: Mote, layer: number): number {
    return vary(mote, LAYER_SIZE_SALT + layer, this.kind.layers[layer]!.size);
  }

  private colorOf(mote: Mote, layer: number): THREE.Color {
    const palette = this.palettes[layer]!;
    const pick = Math.min(Math.floor(vary(mote, LAYER_COLOR_SALT + layer, [0, palette.length])), palette.length - 1);
    return palette[pick]!;
  }
}
