/**
 * Los animalitos del ambiente: pequeños, sentados en su sitio del decorado (la rana en el nenufar o
 * entre los juncos, la ardilla en el arbol, el ciervo en el borde del bosque) y de vez en cuando hacen
 * algo sin irse de ahi (unos saltitos y se giran, asoman y vuelven, el pingüino se tira al agua y
 * vuelve a su sitio). Cada clase es un dato (`CritterKind`, en kinds.ts: su modelo de Ashfox, lo que
 * mide, cada cuanto se mueve y como); aqui solo se mueven sus copias. Lo que hacen cerca de lo que se
 * mira lo cuentan (`AnimalListener`, ports/life.ts), para que suene. Con «reducir el movimiento» se
 * quedan quietos.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { AnimalAct, AnimalListener } from '../../ports/life';
import { reducedMotion } from '../../../ui/motion';
import type { GlbLibrary } from '../pieces/glbModels';
import { instanced, moveCopy, type PlacedMesh } from '../terrain/placed';
import { randomBetween, type Range } from '../core/random';

/**
 * Como esta un animal a una altura de su movimiento, respecto a como esta quieto en su sitio (casillas
 * y radianes). Se ladea y se inclina por los pies (el origen de su modelo).
 */
export interface CritterPose {
  /** Lo que esta subido (en negativo, hundido: el pingüino bajo el agua). */
  lift: number;
  /** Lo que esta adelantado, hacia donde mira en el movimiento (en negativo, atras). */
  forward: number;
  /** Lo que se gira sobre si mismo, ademas de su giro del movimiento. */
  yaw: number;
  /** Lo que se inclina hacia delante, la cabeza abajo (en negativo, hacia atras: la cabeza arriba). */
  pitch: number;
  /** Lo que se ladea a un lado. */
  roll: number;
}

/** Quieto en su sitio. */
const STILL: Readonly<CritterPose> = Object.freeze({ lift: 0, forward: 0, yaw: 0, pitch: 0, roll: 0 });

/**
 * Como cambia de postura a lo largo de un movimiento (`progress`, de 0 a 1): la escribe en `pose`, que
 * llega quieta, y la devuelve. `drop` es lo que esta mas abajo el suelo de delante (casillas): el agua
 * al pie del hielo de la orilla, que puede estar un escalon por debajo.
 */
export type PoseAlong = (progress: number, pose: CritterPose, drop: number) => CritterPose;

/** Lo que hace cada vez: dura `seconds`, se gira `turn` (radianes) a un lado o al otro y, mientras, cambia de postura. */
export interface CritterMove {
  seconds: number;
  turn: Range;
  pose: PoseAlong;
  /** Cuando toca el agua en medio del movimiento (de 0 a 1): el pingüino que se tira y el que sale. */
  splashes?: readonly number[];
}

/** La postura a esa altura de un movimiento (se escribe siempre en el mismo objeto: se pide en cada fotograma). */
const posing: CritterPose = { ...STILL };
export const poseAt = (move: CritterMove, progress: number, drop = 0): Readonly<CritterPose> =>
  move.pose(progress, Object.assign(posing, STILL), drop);

/** Unos saltitos seguidos (`hops`) que suben `height` casillas. */
export const hopping =
  (height: number, hops = 1): PoseAlong =>
  (progress, pose) => {
    pose.lift = Math.abs(Math.sin(progress * Math.PI * hops)) * height;
    return pose;
  };

/** Sale despacio hacia delante `reach` casillas y vuelve a su sitio (el ciervo que asoma). */
export const peeking =
  (reach: number): PoseAlong =>
  (progress, pose) => {
    pose.forward = Math.sin(progress * Math.PI) * reach;
    return pose;
  };

export interface CritterKind {
  /** Su modelo de Ashfox (tools/art/ashfox/models/terrain.mjs). */
  model: string;
  /** Lo que mide respecto a su modelo. */
  size: number;
  /** Cada cuanto se mueve (segundos, al azar entre los dos). */
  every: Range;
  move: CritterMove;
  /** Otro movimiento que hace alguna vez (`share` de las veces) en vez del suyo: el pingüino que se tira al agua. */
  sometimes?: { move: CritterMove; share: number };
}

/**
 * Lo que tiene que haber al otro lado del borde para que valga un sitio del borde: otro terreno (el
 * ciervo que asoma del bosque) o agua (el pingüino de la orilla).
 */
export type SeatEdge = 'otherTerrain' | 'water';

/** Donde se sienta un animal en una clase de casilla. */
export interface CritterSeat {
  kind: CritterKind;
  /** Que parte de las casillas con ese decorado (o, en el suelo, de esa clase) lo lleva. */
  share: number;
  /**
   * El sitio en el modelo del decorado, en casillas (antes de encogerlo): un nenufar, un hueco entre los
   * juncos. En el suelo, desde el centro de la casilla.
   */
  at: readonly [x: number, y: number, z: number];
  /**
   * En el suelo de la casilla y no en su decorado (el hielo de la orilla no lleva). El sitio se gira
   * alrededor del centro de cuarto en cuarto de vuelta, desde uno al azar, hasta que vale.
   */
  onTheGround?: boolean;
  /**
   * Solo en el borde: el sitio vale si la casilla de ese lado es lo que dice, y el animal mira hacia
   * alla. Sin decir, en cualquier casilla y mirando a cualquier lado.
   */
  edge?: SeatEdge;
}

/** Un animal ya puesto: su casilla, donde esta, hacia donde mira (radianes) y lo que baja el suelo de delante (`PoseAlong`). */
export interface CritterSpot {
  pos: Pos;
  at: THREE.Vector3;
  heading: number;
  drop: number;
}

interface Critter {
  spot: CritterSpot;
  heading: number;
  /** Lo que falta para que se mueva (segundos). */
  wait: number;
  /** Lo que lleva de este movimiento (segundos), o null si esta quieto. */
  moving: number | null;
  /** El movimiento que hace (o el ultimo que hizo). */
  move: CritterMove;
  /** Lo que se gira en este movimiento. */
  turn: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/** El movimiento de esta vez: el suyo o, alguna vez, el otro. */
const nextMove = ({ move, sometimes }: CritterKind): CritterMove => (sometimes && Math.random() < sometimes.share ? sometimes.move : move);

/** Los animales de una clase, en sus sitios. */
export class Critters {
  readonly placed: readonly PlacedMesh[];
  private readonly critters: Critter[];
  private readonly size: THREE.Vector3;
  private readonly place = new THREE.Matrix4();
  private readonly turnAround = new THREE.Quaternion();
  private readonly facing = new THREE.Quaternion();
  private readonly tilt = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly lifted = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();

  constructor(
    library: GlbLibrary,
    private readonly kind: CritterKind,
    spots: readonly CritterSpot[],
    private readonly tell: AnimalListener,
  ) {
    this.size = new THREE.Vector3().setScalar(kind.size);
    this.critters = spots.map((spot) => ({
      spot,
      heading: spot.heading,
      wait: randomBetween(kind.every),
      moving: null,
      move: kind.move,
      turn: 0,
    }));
    const places = spots.map((spot) => this.placeOf(spot.at, spot.heading).clone());
    this.placed = instanced(
      library,
      kind.model,
      spots.map((spot) => spot.pos),
      places,
    );
  }

  /** Los mueve y cuenta lo que hacen; quien lo oye lo decide quien escucha (systems/sound/animalCalls.ts). */
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
    this.moveCopies(index, this.placeOf(critter.spot.at, critter.heading + critter.turn));
    this.stop(critter);
  }

  private step(critter: Critter, index: number, seconds: number): void {
    if (critter.moving === null) {
      critter.wait -= seconds;
      if (critter.wait <= 0) this.start(critter);
      return;
    }
    const before = critter.moving / critter.move.seconds;
    critter.moving += seconds;
    const progress = Math.min(critter.moving / critter.move.seconds, 1);
    if (critter.move.splashes?.some((splash) => before < splash && progress >= splash)) this.told(critter, 'splash');
    const heading = critter.heading + critter.turn * progress;
    this.moveCopies(index, this.placeOf(critter.spot.at, heading, poseAt(critter.move, progress, critter.spot.drop)));
    if (progress === 1) this.stop(critter);
  }

  private start(critter: Critter): void {
    critter.moving = 0;
    critter.move = nextMove(this.kind);
    critter.turn = randomBetween(critter.move.turn) * (Math.random() < 0.5 ? -1 : 1);
    this.told(critter, critter.move === this.kind.move ? 'move' : 'other');
  }

  private told(critter: Critter, act: AnimalAct): void {
    const { at } = critter.spot;
    this.tell({ animal: this.kind.model, act, at: { x: at.x, y: at.y, z: at.z } });
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
   * Donde va un animal: en su sitio, mirando a `heading` y en su postura (se reutiliza la matriz). Los
   * modelos de Ashfox miran al norte (-z): delante es -z girado; se gira sobre si mismo, despues se
   * inclina hacia delante (sobre x) y se ladea (sobre z), cada cosa respecto a como ha quedado.
   */
  private placeOf(at: THREE.Vector3, heading: number, pose: Readonly<CritterPose> = STILL): THREE.Matrix4 {
    this.turnAround.setFromAxisAngle(UP, heading);
    this.ahead.set(0, 0, -pose.forward).applyQuaternion(this.turnAround);
    this.lifted.copy(at).add(this.ahead).addScaledVector(UP, pose.lift);
    this.facing.setFromEuler(this.tilt.set(-pose.pitch, heading + pose.yaw, pose.roll));
    return this.place.compose(this.lifted, this.facing, this.size);
  }
}
