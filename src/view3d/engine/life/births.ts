/**
 * Donde y cuando nace lo que vuela cerca de lo que se mira (las motas y los viajeros): cada clase dice
 * cuantas puede haber, lo que viven, a que altura nacen, cuantas nacen por segundo y, si van a otra de
 * sus casillas, a que distancia; aqui se lleva la cuenta y se eligen las casillas, de las suyas cerca de
 * la camara.
 */
import type * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { pointIn, type Range } from '../core/random';

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
   * (casillas, entre las dos). De una casilla sin ninguna a esa distancia no sale.
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

/** Un numero entre 0 y 1 al azar (`Math.random`, o uno con semilla en los tests). */
export type Random = () => number;

export class Births {
  private time = 0;
  /** Las que pueden nacer ya (`BirthPlan.birthRate`). */
  private ready = 0;
  /** Las casillas cerca de lo que se mira y alrededor de donde (casilla y radio redondeados) se buscaron. */
  private nearby: readonly Pos[] = [];
  private readonly nearbyAround = { x: Number.NaN, z: Number.NaN, radius: Number.NaN };
  /**
   * Con `landing`, a que casillas puede ir el que nace en cada una: se buscan una vez por casilla. Las
   * claves son los mismos objetos de `tiles` (de ahi salen las de `nearby`), que no cambian en la partida.
   */
  private readonly landings = new Map<Pos, readonly Pos[]>();

  constructor(
    private readonly plan: BirthPlan,
    readonly tiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
    private readonly random: Random = Math.random,
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
    const tile = this.anyOf(this.nearby);
    if (this.ready < 1 || !tile) return null;
    this.ready -= 1;
    // Los puntos del suelo son vectores nuevos: se mueven ahi mismo y se los queda.
    const lift = pointIn(this.plan.height, this.random());
    const flier: Flier = {
      home: this.pointOver(this.groundOf(tile), lift),
      age: 0,
      life: pointIn(this.plan.life, this.random()),
      seed: this.random() * SEED_SPREAD,
    };
    const landing = this.anyOf(this.landingsFrom(tile));
    if (landing) flier.goal = this.pointOver(this.groundOf(landing), lift);
    return flier;
  }

  /** Uno al azar de una lista (ninguno si esta vacia). */
  private anyOf<Item>(items: readonly Item[]): Item | undefined {
    return items[Math.floor(this.random() * items.length)];
  }

  /** Un punto de una casilla a la altura `lift` sobre su suelo, algo movido al azar dentro de ella. */
  private pointOver(ground: THREE.Vector3, lift: number): THREE.Vector3 {
    ground.x += this.random() - 0.5;
    ground.y += lift;
    ground.z += this.random() - 0.5;
    return ground;
  }

  /** Las casillas a las que puede ir el que nace en `from` (`BirthPlan.landing`; sin el, ninguna). */
  private landingsFrom(from: Pos): readonly Pos[] {
    const { landing } = this.plan;
    if (!landing) return [];
    const known = this.landings.get(from);
    if (known) return known;
    const [nearest, farthest] = landing;
    const found = this.tiles.filter((pos) => {
      const distance = Math.hypot(pos.x - from.x, pos.y - from.y);
      return distance >= nearest && distance <= farthest;
    });
    this.landings.set(from, found);
    return found;
  }

  /** Si de esa casilla puede salir algo: siempre, salvo si tiene que ir a otra y no hay ninguna a su distancia. */
  private canTakeOff(pos: Pos): boolean {
    return !this.plan.landing || this.landingsFrom(pos).length > 0;
  }

  /**
   * Las casillas cerca de lo que se mira de las que puede salir algo: se buscan otra vez solo si la camara
   * cambia de casilla o de distancia (no en cada fotograma).
   */
  private lookAround(center: THREE.Vector3, radius: number): void {
    const around = this.nearbyAround;
    const x = Math.round(center.x);
    const z = Math.round(center.z);
    const reach = Math.round(radius);
    if (x === around.x && z === around.z && reach === around.radius) return;
    Object.assign(around, { x, z, radius: reach });
    const isNear = (pos: Pos) => Math.abs(pos.x - x) < reach && Math.abs(pos.y - z) < reach;
    this.nearby = this.tiles.filter((pos) => isNear(pos) && this.canTakeOff(pos));
  }
}

/** Avanza uno que vive (null si se le acaba la vida) o, en un hueco, hace nacer otro si toca. */
export function stepLife(flier: Flier | null, seconds: number, births: Births): Flier | null {
  if (!flier) return births.next();
  flier.age += seconds;
  return flier.age < flier.life ? flier : null;
}
