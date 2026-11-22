/**
 * Donde y cuando nace lo que vuela cerca de lo que se mira (las motas y los viajeros): cada clase dice
 * cuantas puede haber, lo que viven, a que altura nacen, cuantas nacen por segundo y, si van a otra de
 * sus casillas, a que distancia; aqui se lleva la cuenta y se eligen las casillas, de las suyas cerca de
 * la camara.
 */
import type * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { pointIn, randomBetween, type Range } from '../core/random';

/** Lo que nace y vive un rato sobre su casilla: una mota, un pajaro. Lo propio de cada uno sale de su semilla (`vary`). */
export interface Flier {
  /** Donde nacio: de ahi sale su vuelo. */
  home: THREE.Vector3;
  /** Si va a otra de sus casillas (`BirthPlan.landing`), donde acaba: a la altura a la que nacio. */
  goal?: THREE.Vector3;
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
  /**
   * Si acaba en otra de sus casillas (el pajaro que va de una copa a otra): a que distancia de la suya
   * (casillas, entre las dos). Si no hay ninguna a esa distancia, no nace.
   */
  landing?: Range;
}

/** Hasta donde llegan las semillas: lo bastante para que dos no salgan parecidas. */
const SEED_SPREAD = 1000;

/** Un numero de `range` propio de cada uno: con la misma `salt`, siempre el mismo para el. */
export function vary(flier: Flier, salt: number, range: Range): number {
  const value = Math.sin(flier.seed * 12.9898 + salt * 78.233) * 43758.5453;
  return pointIn(range, value - Math.floor(value));
}

/** Entra y sale despacio de su vida: nada de puntos que aparecen o desaparecen de golpe. */
export const lifeFade = (flier: Flier): number => Math.sin((flier.age / flier.life) * Math.PI);

/** Uno al azar de una lista (ninguno si esta vacia). */
const anyOf = <Item>(items: readonly Item[]): Item | undefined => items[Math.floor(Math.random() * items.length)];

/** Un punto de una casilla a la altura `lift` sobre su suelo, algo movido al azar dentro de ella. */
function pointOver(ground: THREE.Vector3, lift: number): THREE.Vector3 {
  ground.x += Math.random() - 0.5;
  ground.y += lift;
  ground.z += Math.random() - 0.5;
  return ground;
}

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
  next(): Flier | null {
    const tile = anyOf(this.nearby);
    if (this.ready < 1 || !tile) return null;
    const { landing } = this.plan;
    const landingTile = landing && this.tileAtDistance(tile, landing);
    if (landing && !landingTile) return null;
    this.ready -= 1;
    // Los puntos del suelo son vectores nuevos: se mueven ahi mismo y se los queda.
    const lift = randomBetween(this.plan.height);
    const flier: Flier = {
      home: pointOver(this.groundOf(tile), lift),
      age: 0,
      life: randomBetween(this.plan.life),
      seed: Math.random() * SEED_SPREAD,
    };
    if (landingTile) flier.goal = pointOver(this.groundOf(landingTile), lift);
    return flier;
  }

  /** Una de sus casillas al azar a esa distancia de `from` (casillas, entre las dos), si hay alguna. */
  private tileAtDistance(from: Pos, [nearest, farthest]: Range): Pos | undefined {
    return anyOf(
      this.tiles.filter((pos) => {
        const distance = Math.hypot(pos.x - from.x, pos.y - from.y);
        return distance >= nearest && distance <= farthest;
      }),
    );
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

/** Avanza uno que vive (null si se le acaba la vida) o, en un hueco, hace nacer otro si toca. */
export function stepLife(flier: Flier | null, seconds: number, births: Births): Flier | null {
  if (!flier) return births.next();
  flier.age += seconds;
  return flier.age < flier.life ? flier : null;
}
