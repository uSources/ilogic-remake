/**
 * Las ranas del pantano: pequeñas, sentadas en un nenufar o entre los juncos (donde diga el decorado de
 * su casilla, `FrogSeat`), y de vez en cuando una da un saltito en su sitio y se gira. Son copias del
 * modelo `frog` de Ashfox; con «reducir el movimiento» se quedan quietas.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import type { GlbLibrary } from '../pieces/glbModels';
import { instanced, moveCopy, type PlacedMesh } from './placed';
import { randomBetween } from '../core/random';

/** El modelo de Ashfox de la rana (tools/art/ashfox/models/terrain.mjs). */
export const FROG_MODEL = 'frog';

/** Donde se sienta una rana en el decorado de una clase de casilla. */
export interface FrogSeat {
  /** Que parte de las casillas con ese decorado lleva rana. */
  share: number;
  /** El sitio en el modelo del decorado, en casillas (antes de encogerlo): un nenufar, un hueco entre los juncos. */
  at: readonly [x: number, y: number, z: number];
}

/** Una rana ya puesta: su casilla, donde esta y hacia donde mira (radianes). */
export interface FrogSpot {
  pos: Pos;
  at: THREE.Vector3;
  heading: number;
}

/** Lo que dura un salto (segundos) y lo que sube (casillas). */
const HOP_SECONDS = 0.35;
const HOP_HEIGHT = 0.08;
/** Cada cuanto salta cada una (segundos, al azar entre los dos). */
const HOP_EVERY = [5, 14] as const;
/** Lo que se gira en un salto (radianes, a un lado o al otro). */
const HOP_TURN = [0.6, 1.8] as const;
const UP = new THREE.Vector3(0, 1, 0);
/** Su tamaño respecto al modelo: ranitas, mas pequeñas que un soldado (docs/ESTETICA.md, «Pantano»). */
const FROG_SIZE = new THREE.Vector3(0.55, 0.55, 0.55);

interface Frog {
  spot: FrogSpot;
  heading: number;
  /** Lo que falta para el proximo salto (segundos). */
  wait: number;
  /** Lo que va del salto (segundos), o null si esta sentada. */
  hop: number | null;
  /** Lo que se gira en este salto. */
  turn: number;
}

export class Frogs {
  readonly placed: readonly PlacedMesh[];
  private readonly frogs: Frog[];
  private readonly place = new THREE.Matrix4();
  private readonly turnAround = new THREE.Quaternion();
  private readonly lifted = new THREE.Vector3();

  constructor(library: GlbLibrary, spots: readonly FrogSpot[]) {
    this.frogs = spots.map((spot) => ({ spot, heading: spot.heading, wait: randomBetween(HOP_EVERY), hop: null, turn: 0 }));
    const places = spots.map((spot) => this.placeOf(spot.at, spot.heading, 0).clone());
    this.placed = spots.length
      ? instanced(
          library,
          FROG_MODEL,
          spots.map((spot) => spot.pos),
          places,
        )
      : [];
  }

  update(seconds: number): void {
    if (reducedMotion()) {
      this.frogs.forEach((frog, index) => this.settle(frog, index));
      return;
    }
    this.frogs.forEach((frog, index) => this.step(frog, index, seconds));
  }

  /** Con «reducir el movimiento», la que estaba saltando cae ya en su sitio (no se queda en el aire). */
  private settle(frog: Frog, index: number): void {
    if (frog.hop === null) return;
    this.moveFrog(index, this.placeOf(frog.spot.at, frog.heading + frog.turn, 0));
    this.land(frog);
  }

  private step(frog: Frog, index: number, seconds: number): void {
    if (frog.hop === null) {
      frog.wait -= seconds;
      if (frog.wait <= 0) this.startHop(frog);
      return;
    }
    frog.hop += seconds;
    const progress = Math.min(frog.hop / HOP_SECONDS, 1);
    const lift = Math.sin(progress * Math.PI) * HOP_HEIGHT;
    this.moveFrog(index, this.placeOf(frog.spot.at, frog.heading + frog.turn * progress, lift));
    if (progress === 1) this.land(frog);
  }

  private startHop(frog: Frog): void {
    frog.hop = 0;
    frog.turn = randomBetween(HOP_TURN) * (Math.random() < 0.5 ? -1 : 1);
  }

  private land(frog: Frog): void {
    frog.heading += frog.turn;
    frog.hop = null;
    frog.wait = randomBetween(HOP_EVERY);
  }

  private moveFrog(index: number, place: THREE.Matrix4): void {
    for (const part of this.placed) moveCopy(part, index, place);
  }

  /** Donde va una rana: en su sitio, subida `lift` y mirando a `heading` (se reutiliza la matriz). */
  private placeOf(at: THREE.Vector3, heading: number, lift: number): THREE.Matrix4 {
    this.turnAround.setFromAxisAngle(UP, heading);
    this.lifted.copy(at).addScaledVector(UP, lift);
    return this.place.compose(this.lifted, this.turnAround, FROG_SIZE);
  }
}
