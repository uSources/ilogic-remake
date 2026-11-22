/**
 * Las motas del ambiente: puntitos que salen de las casillas de su terreno cerca de lo que se mira,
 * viven un rato y se van (el polvo de la arena, las luciernagas). Cada clase es un dato (`MoteKind`,
 * en kinds.ts: cuantas, de que color, como vuelan y como brillan); aqui todas se mueven y se dibujan
 * igual, una bandada por clase. Con «reducir el movimiento» no salen.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import { PixelPoints } from '../fx/pixelPoints';
import { pointIn, randomBetween, type Range } from '../core/random';

/** Un punto de cada mota: el polvo lleva uno; la luciernaga, su halo y su nucleo. */
export interface MoteLayer {
  color: THREE.ColorRepresentation;
  opacity: number;
  /** Lo que mide (casillas): cada mota, lo suyo entre los dos. */
  size: Range;
  /** Si brilla: suma su luz a lo de detras y se apaga hacia el borde (`PixelPoints.glow`). */
  glow?: boolean;
}

/** Una mota viva. Lo propio de cada una (su ritmo, su desfase, su tamaño) sale de su semilla: `vary`. */
export interface Mote {
  /** Donde nacio: de ahi sale su vuelo. */
  home: THREE.Vector3;
  age: number;
  life: number;
  seed: number;
}

export interface MoteKind {
  /** Cuantas puede haber a la vez. */
  count: number;
  /** Como se dibuja cada una: un punto por capa, la primera debajo. */
  layers: readonly MoteLayer[];
  /** Lo que vive cada una (segundos). */
  life: Range;
  /** A que altura de su casilla nace (casillas). */
  height: Range;
  /**
   * Cuantas pueden nacer por segundo cuando la bandada lleva `time` segundos. Las que no nacen se van
   * sumando para despues, pero si deja de nacer (0) se pierden: asi el polvo sale solo en las rafagas.
   */
  birthRate(time: number): number;
  /** Donde esta a su edad (lo escribe en `out` y lo devuelve): su vuelo desde donde nacio. */
  flight(mote: Mote, out: THREE.Vector3): THREE.Vector3;
  /** Cuanto se ve a su edad (0 a 1). */
  brightness(mote: Mote): number;
}

/** Hasta donde llegan las semillas: lo bastante para que dos motas no salgan parecidas. */
const SEED_SPREAD = 1000;
/** Las semillas de `vary` desde aqui son del tamaño de cada capa (las de antes, de las clases de kinds.ts). */
const LAYER_SIZE_SALT = 100;

/** Un numero de `range` propio de esa mota: con la misma `salt`, siempre el mismo para ella. */
export function vary(mote: Mote, salt: number, range: Range): number {
  const value = Math.sin(mote.seed * 12.9898 + salt * 78.233) * 43758.5453;
  return pointIn(range, value - Math.floor(value));
}

/** Entra y sale despacio de su vida: nada de puntos que aparecen o desaparecen de golpe. */
export const lifeFade = (mote: Mote): number => Math.sin((mote.age / mote.life) * Math.PI);

/** Los puntos de una capa, con su color y, si brilla, su brillo. */
function pointsOf(layer: MoteLayer, count: number): PixelPoints {
  const points = new PixelPoints(count);
  points.setLook(layer.color, layer.opacity);
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

/** Las motas de una clase sobre sus casillas. */
export class MoteSwarm {
  readonly object = new THREE.Group();
  private readonly layers: readonly PixelPoints[];
  private readonly motes: (Mote | null)[];
  private time = 0;
  /** Las que pueden nacer ya (`MoteKind.birthRate`). */
  private births = 0;
  private readonly at = new THREE.Vector3();
  /** Las casillas cerca de lo que se mira y alrededor de donde (casilla y radio redondeados) se buscaron. */
  private nearby: readonly Pos[] = [];
  private readonly nearbyAround = { x: Number.NaN, z: Number.NaN, radius: Number.NaN };

  constructor(
    private readonly kind: MoteKind,
    private readonly tiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
  ) {
    this.layers = kind.layers.map((layer) => pointsOf(layer, kind.count));
    this.motes = Array.from({ length: kind.count }, () => null);
    this.object.add(...this.layers.map((points) => points.object));
  }

  /** Avanza las motas cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.object.visible = this.tiles.length > 0 && !reducedMotion();
    if (!this.object.visible) return;
    this.time += seconds;
    for (const points of this.layers) points.setScale(viewportHeight, camera);
    const rate = this.kind.birthRate(this.time);
    this.births = rate > 0 ? Math.min(this.births + rate * seconds, this.kind.count) : 0;
    const nearby = this.tilesNear(center, radius);
    this.motes.forEach((mote, index) => (this.motes[index] = this.step(mote, seconds, nearby)));
    this.draw();
  }

  /** Las casillas cerca de lo que se mira: se buscan otra vez solo si la camara cambia de casilla o de distancia. */
  private tilesNear(center: THREE.Vector3, radius: number): readonly Pos[] {
    const around = this.nearbyAround;
    const x = Math.round(center.x);
    const z = Math.round(center.z);
    const reach = Math.round(radius);
    if (x === around.x && z === around.z && reach === around.radius) return this.nearby;
    Object.assign(around, { x, z, radius: reach });
    this.nearby = this.tiles.filter((pos) => Math.abs(pos.x - x) < reach && Math.abs(pos.y - z) < reach);
    return this.nearby;
  }

  private step(mote: Mote | null, seconds: number, nearby: readonly Pos[]): Mote | null {
    if (!mote) return this.births >= 1 ? this.born(nearby) : null;
    mote.age += seconds;
    return mote.age < mote.life ? mote : null;
  }

  /** Una mota nueva sobre una casilla al azar de `nearby` (ninguna si no hay casillas cerca). */
  private born(nearby: readonly Pos[]): Mote | null {
    const tile = nearby[Math.floor(Math.random() * nearby.length)];
    if (!tile) return null;
    this.births -= 1;
    // El punto del suelo es un vector nuevo: se mueve ahi mismo a donde nace y la mota se lo queda.
    const home = this.groundOf(tile);
    home.x += Math.random() - 0.5;
    home.y += randomBetween(this.kind.height);
    home.z += Math.random() - 0.5;
    return { home, age: 0, life: randomBetween(this.kind.life), seed: Math.random() * SEED_SPREAD };
  }

  private draw(): void {
    this.motes.forEach((mote, index) => {
      const at = mote && this.kind.flight(mote, this.at);
      const brightness = mote ? this.kind.brightness(mote) : 0;
      this.layers.forEach((points, layer) => setPoint(points, index, at, mote ? this.sizeOf(mote, layer) : 0, brightness));
    });
    for (const points of this.layers) points.commit();
  }

  private sizeOf(mote: Mote, layer: number): number {
    return vary(mote, LAYER_SIZE_SALT + layer, this.kind.layers[layer]!.size);
  }
}
