/**
 * Donde y cuando nace lo que vuela cerca de lo que se mira (las motas y los viajeros): cada clase dice
 * cuantas puede haber, lo que viven, a que altura nacen y cuantas nacen por segundo; aqui se lleva la
 * cuenta y se elige la casilla, una de las suyas cerca de la camara.
 */
import type * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { randomBetween, type Range } from '../core/random';

/** Lo que nace y vive un rato sobre su casilla: una mota, un pajaro. Lo propio de cada uno sale de su semilla (`vary`). */
export interface Mote {
  /** Donde nacio: de ahi sale su vuelo. */
  home: THREE.Vector3;
  age: number;
  life: number;
  seed: number;
}

/** Lo que una clase dice de sus nacimientos. */
export interface BirthPlan {
  /** Cuantas puede haber a la vez. */
  count: number;
  /** Lo que vive cada una (segundos). */
  life: Range;
  /** A que altura de su casilla nace (casillas). */
  height: Range;
  /**
   * Cuantas pueden nacer por segundo cuando la bandada lleva `time` segundos. Las que no nacen se van
   * sumando para despues, pero si deja de nacer (0) se pierden: asi el polvo sale solo en las rafagas.
   */
  birthRate(time: number): number;
}

/** Hasta donde llegan las semillas: lo bastante para que dos no salgan parecidas. */
const SEED_SPREAD = 1000;

export class Births {
  private time = 0;
  /** Las que pueden nacer ya (`BirthPlan.birthRate`). */
  private ready = 0;
  /** Las casillas cerca de lo que se mira y alrededor de donde (casilla y radio redondeados) se buscaron. */
  private nearby: readonly Pos[] = [];
  private readonly nearbyAround = { x: Number.NaN, z: Number.NaN, radius: Number.NaN };

  constructor(
    private readonly plan: BirthPlan,
    readonly tiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
  ) {}

  /** Pasa el tiempo y mira que casillas quedan cerca de `center` (lo que mira la camara), en un radio `radius`. */
  tick(seconds: number, center: THREE.Vector3, radius: number): void {
    this.time += seconds;
    const rate = this.plan.birthRate(this.time);
    this.ready = rate > 0 ? Math.min(this.ready + rate * seconds, this.plan.count) : 0;
    this.lookAround(center, radius);
  }

  /** Una nueva sobre una casilla al azar de las de cerca, si le toca nacer y hay alguna; si no, null. */
  next(): Mote | null {
    const tile = this.nearby[Math.floor(Math.random() * this.nearby.length)];
    if (this.ready < 1 || !tile) return null;
    this.ready -= 1;
    // El punto del suelo es un vector nuevo: se mueve ahi mismo a donde nace y se lo queda.
    const home = this.groundOf(tile);
    home.x += Math.random() - 0.5;
    home.y += randomBetween(this.plan.height);
    home.z += Math.random() - 0.5;
    return { home, age: 0, life: randomBetween(this.plan.life), seed: Math.random() * SEED_SPREAD };
  }

  /** Las casillas cerca de lo que se mira: se buscan otra vez solo si la camara cambia de casilla o de distancia. */
  private lookAround(center: THREE.Vector3, radius: number): void {
    const around = this.nearbyAround;
    const x = Math.round(center.x);
    const z = Math.round(center.z);
    const reach = Math.round(radius);
    if (x === around.x && z === around.z && reach === around.radius) return;
    Object.assign(around, { x, z, radius: reach });
    this.nearby = this.tiles.filter((pos) => Math.abs(pos.x - x) < reach && Math.abs(pos.y - z) < reach);
  }
}

/** Avanza una que vive (null si se le acaba la vida) o, en un hueco, hace nacer otra si toca. */
export function stepLife(mote: Mote | null, seconds: number, births: Births): Mote | null {
  if (!mote) return births.next();
  mote.age += seconds;
  return mote.age < mote.life ? mote : null;
}
