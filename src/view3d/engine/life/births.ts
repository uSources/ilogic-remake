/**
 * Donde y cuando nace lo que vuela cerca de lo que se mira (las motas y los viajeros): cada clase dice
 * cuantas puede haber, lo que viven, a que altura nacen, cuantas nacen por segundo (y si juntas) y, si
 * van a otra de sus casillas, cual; aqui se lleva la cuenta y se eligen las casillas, de las suyas cerca
 * de la camara.
 */
import type * as THREE from 'three';
import { posKey } from '../../../core/geom';
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
  /** Su puesto en su tanda (`BirthPlan.together`), desde 0: el ganso que va en cabeza de la V y los de detras. */
  rank?: number;
}

/** A que otra de sus casillas va el que nace (el pajaro que cambia de copa, la bola que rueda con el viento). */
export interface Landing {
  /** A que distancia de la suya (casillas, entre las dos). */
  distance: Range;
  /** Hacia donde (en el suelo), y lo que se puede apartar de ahi (radianes); sin decir, a cualquier lado. */
  toward?: { direction: Readonly<THREE.Vector3>; spread: number };
  /** Si va por el suelo: el camino recto hasta alli pasa solo por sus casillas (la bola no cruza una meseta). */
  overland?: boolean;
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
  /** Si acaba en otra de sus casillas: cual puede ser. De una casilla sin ninguna asi no sale. */
  landing?: Landing;
  /** Cuantas nacen juntas, en el mismo sitio y con la misma vida (los granos de un remolino); sin decir, una. */
  together?: number;
  /**
   * Que parte del radio alrededor de lo que se mira usa para nacer (sin decir, todo). Del cuadrado de ese
   * radio solo sale en pantalla la parte del medio: lo que es raro y se tiene que ver (el buitre, el
   * remolino) nace mas cerca.
   */
  reach?: number;
}

/** Hasta donde llegan las semillas: lo bastante para que dos no salgan parecidas. */
const SEED_SPREAD = 1000;
/**
 * Por el camino de lo que va por el suelo: cada cuanto se mira que casilla pisa (casillas) y a cuanto
 * de la linea recta a cada lado (lo que se mueven al azar donde nace y donde acaba, `pointOver`).
 */
const PATH_STEP = 0.25;
const PATH_WIDTH = [-0.5, 0, 0.5];

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
  /** Las suyas, para saber pronto si una casilla lo es (`Landing.overland`). */
  private readonly own: ReadonlySet<string>;
  /** La tanda que esta naciendo (`together`): la primera, de la que copian sitio y vida, y las que faltan. */
  private batch: { first: Flier; left: number } | null = null;

  constructor(
    private readonly plan: BirthPlan,
    readonly tiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
    private readonly random: Random = Math.random,
  ) {
    this.own = new Set(tiles.map(posKey));
  }

  /** Pasa el tiempo y mira que casillas quedan cerca de `center` (lo que mira la camara), en un radio `radius`. */
  tick(seconds: number, center: THREE.Vector3, radius: number): void {
    this.time += seconds;
    const rate = this.plan.birthRate(this.time);
    this.ready = rate > 0 ? Math.min(this.ready + rate * seconds, this.plan.count) : 0;
    this.lookAround(center, radius * (this.plan.reach ?? 1));
  }

  /**
   * Una nueva sobre una casilla al azar de las de cerca, si le toca nacer y hay alguna (o la siguiente de
   * su tanda); si no, null.
   */
  next(): Flier | null {
    if (this.batch) return this.nextOfBatch(this.batch);
    const tile = this.anyOf(this.nearby);
    if (this.ready < 1 || !tile) return null;
    this.ready -= 1;
    const flier = this.bornOn(tile);
    const together = this.plan.together ?? 1;
    if (together > 1) {
      flier.rank = 0;
      this.batch = { first: flier, left: together - 1 };
    }
    return flier;
  }

  private bornOn(tile: Pos): Flier {
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

  /** Otra de la tanda: en el mismo sitio y con la misma vida que la primera, pero con su semilla y su puesto. */
  private nextOfBatch(batch: { first: Flier; left: number }): Flier {
    batch.left -= 1;
    if (batch.left <= 0) this.batch = null;
    const { first } = batch;
    const rank = (this.plan.together ?? 1) - 1 - batch.left;
    const flier: Flier = { home: first.home.clone(), age: 0, life: first.life, seed: this.random() * SEED_SPREAD, rank };
    if (first.goal) flier.goal = first.goal.clone();
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
    const found = this.tiles.filter((to) => this.canLand(landing, from, to));
    this.landings.set(from, found);
    return found;
  }

  /** Si el que nace en `from` puede ir a `to`: a su distancia y, si lo pide, hacia su lado y por sus casillas. */
  private canLand(landing: Landing, from: Pos, to: Pos): boolean {
    const [nearest, farthest] = landing.distance;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    if (distance < nearest || distance > farthest) return false;
    if (landing.toward && !isToward(landing.toward, from, to, distance)) return false;
    return !landing.overland || this.isOverOwnTiles(from, to, distance);
  }

  /** Si todo el camino recto de `from` a `to` (con lo que se aparta a los lados) va por sus casillas. */
  private isOverOwnTiles(from: Pos, to: Pos, distance: number): boolean {
    const steps = Math.ceil(distance / PATH_STEP);
    const sideX = -(to.y - from.y) / distance;
    const sideY = (to.x - from.x) / distance;
    return Array.from({ length: steps + 1 }, (_, step) => step / steps).every((share) =>
      PATH_WIDTH.every((aside) => {
        const x = Math.round(from.x + (to.x - from.x) * share + sideX * aside);
        const y = Math.round(from.y + (to.y - from.y) * share + sideY * aside);
        return this.own.has(posKey({ x, y }));
      }),
    );
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

/** Si `to` queda hacia `toward.direction` desde `from` (apartandose como mucho `spread` radianes). */
function isToward(toward: NonNullable<Landing['toward']>, from: Pos, to: Pos, distance: number): boolean {
  const along = ((to.x - from.x) * toward.direction.x + (to.y - from.y) * toward.direction.z) / distance;
  return along >= Math.cos(toward.spread);
}

/** Avanza uno que vive (null si se le acaba la vida) o, en un hueco, hace nacer otro si toca. */
export function stepLife(flier: Flier | null, seconds: number, births: Births): Flier | null {
  if (!flier) return births.next();
  flier.age += seconds;
  return flier.age < flier.life ? flier : null;
}
