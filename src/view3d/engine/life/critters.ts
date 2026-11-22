/**
 * Los animalitos del ambiente: pequeños, sentados en su sitio del decorado (la rana en el nenufar o
 * entre los juncos, la ardilla en el arbol, el ciervo en el borde del bosque) y de vez en cuando hacen
 * algo sin irse de ahi (unos saltitos y se giran, o asoman y vuelven). Cada clase es un dato
 * (`CritterKind`, en kinds.ts: su modelo de Ashfox, lo que mide, cada cuanto se mueve y como); aqui
 * solo se mueven sus copias. Con «reducir el movimiento» se quedan quietos.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import type { GlbLibrary } from '../pieces/glbModels';
import { instanced, moveCopy, type PlacedMesh } from '../terrain/placed';
import { randomBetween, type Range } from '../core/random';

/**
 * Lo que hace cada vez: dura `seconds`, da `hops` saltitos (sin decir, uno) que suben `height` (casillas)
 * y se gira `turn` (radianes) a un lado o al otro. Con `reach`, ademas, sale hacia delante esas casillas
 * y vuelve (el ciervo que asoma).
 */
export interface CritterMove {
  seconds: number;
  height: number;
  turn: Range;
  hops?: number;
  reach?: number;
}

export interface CritterKind {
  /** Su modelo de Ashfox (tools/art/ashfox/models/terrain.mjs). */
  model: string;
  /** Lo que mide respecto a su modelo. */
  size: number;
  /** Cada cuanto se mueve (segundos, al azar entre los dos). */
  every: Range;
  move: CritterMove;
}

/** Donde se sienta un animal en el decorado de una clase de casilla. */
export interface CritterSeat {
  kind: CritterKind;
  /** Que parte de las casillas con ese decorado lo lleva. */
  share: number;
  /** El sitio en el modelo del decorado, en casillas (antes de encogerlo): un nenufar, un hueco entre los juncos. */
  at: readonly [x: number, y: number, z: number];
  /**
   * Solo en el borde: el sitio vale si la casilla de ese lado es de otro terreno, y el animal mira hacia
   * alla (el ciervo que asoma del bosque). Sin decir, en cualquier casilla y mirando a cualquier lado.
   */
  edge?: boolean;
}

/** Un animal ya puesto: su casilla, donde esta y hacia donde mira (radianes). */
export interface CritterSpot {
  pos: Pos;
  at: THREE.Vector3;
  heading: number;
}

interface Critter {
  spot: CritterSpot;
  heading: number;
  /** Lo que falta para que se mueva (segundos). */
  wait: number;
  /** Lo que lleva de este movimiento (segundos), o null si esta quieto. */
  moving: number | null;
  /** Lo que se gira en este movimiento. */
  turn: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Lo que esta subido a esa altura (`progress`, de 0 a 1) de su movimiento: sus saltitos, uno tras otro. */
export const liftAt = (move: CritterMove, progress: number): number =>
  Math.abs(Math.sin(progress * Math.PI * (move.hops ?? 1))) * move.height;

/** Lo que esta adelantado a esa altura de su movimiento: sale despacio y vuelve a su sitio. */
export const forwardAt = (move: CritterMove, progress: number): number => Math.sin(progress * Math.PI) * (move.reach ?? 0);

/** Los animales de una clase, en sus sitios. */
export class Critters {
  readonly placed: readonly PlacedMesh[];
  private readonly critters: Critter[];
  private readonly size: THREE.Vector3;
  private readonly place = new THREE.Matrix4();
  private readonly turnAround = new THREE.Quaternion();
  private readonly lifted = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();

  constructor(
    library: GlbLibrary,
    private readonly kind: CritterKind,
    spots: readonly CritterSpot[],
  ) {
    this.size = new THREE.Vector3().setScalar(kind.size);
    this.critters = spots.map((spot) => ({ spot, heading: spot.heading, wait: randomBetween(kind.every), moving: null, turn: 0 }));
    const places = spots.map((spot) => this.placeOf(spot.at, spot.heading, 0).clone());
    this.placed = instanced(
      library,
      kind.model,
      spots.map((spot) => spot.pos),
      places,
    );
  }

  update(seconds: number): void {
    if (reducedMotion()) {
      this.critters.forEach((critter, index) => this.settle(critter, index));
      return;
    }
    this.critters.forEach((critter, index) => this.step(critter, index, seconds));
  }

  /** Con «reducir el movimiento», el que se estaba moviendo acaba ya en su sitio (no se queda en el aire). */
  private settle(critter: Critter, index: number): void {
    if (critter.moving === null) return;
    this.moveCopies(index, this.placeOf(critter.spot.at, critter.heading + critter.turn, 0));
    this.stop(critter);
  }

  private step(critter: Critter, index: number, seconds: number): void {
    if (critter.moving === null) {
      critter.wait -= seconds;
      if (critter.wait <= 0) this.start(critter);
      return;
    }
    critter.moving += seconds;
    const { move } = this.kind;
    const progress = Math.min(critter.moving / move.seconds, 1);
    const heading = critter.heading + critter.turn * progress;
    this.moveCopies(index, this.placeOf(critter.spot.at, heading, liftAt(move, progress), forwardAt(move, progress)));
    if (progress === 1) this.stop(critter);
  }

  private start(critter: Critter): void {
    critter.moving = 0;
    critter.turn = randomBetween(this.kind.move.turn) * (Math.random() < 0.5 ? -1 : 1);
  }

  private stop(critter: Critter): void {
    critter.heading += critter.turn;
    critter.moving = null;
    critter.wait = randomBetween(this.kind.every);
  }

  private moveCopies(index: number, place: THREE.Matrix4): void {
    for (const part of this.placed) moveCopy(part, index, place);
  }

  /**
   * Donde va un animal: en su sitio, subido `lift`, adelantado `forward` y mirando a `heading` (se
   * reutiliza la matriz). Los modelos de Ashfox miran al norte (-z): delante es -z girado.
   */
  private placeOf(at: THREE.Vector3, heading: number, lift: number, forward = 0): THREE.Matrix4 {
    this.turnAround.setFromAxisAngle(UP, heading);
    this.ahead.set(0, 0, -forward).applyQuaternion(this.turnAround);
    this.lifted.copy(at).add(this.ahead).addScaledVector(UP, lift);
    return this.place.compose(this.lifted, this.turnAround, this.size);
  }
}
