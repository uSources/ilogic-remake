/**
 * Lo que cuenta el motor de los animalitos del tablero (engine/life/: la rana que salta, el pajaro que
 * sale de una copa) para quien quiera oirlo: que animal, que ha hecho y donde. Que suena con cada cosa
 * lo decide un sistema (systems/sound/animalCalls.ts); el motor no sabe de sonidos.
 */
import type { Point3 } from './camera';

/**
 * Lo que hace un animal: empieza su movimiento de siempre (`move`) o el que hace alguna vez (`other`: el
 * pingüino que se tira al agua), cae al agua en medio de uno (`splash`) o sale de su casilla y se va
 * (`leave`: el pajaro, el pez que salta, la bandada de gansos, una vez por bandada).
 */
export type AnimalAct = 'move' | 'other' | 'splash' | 'leave';

export interface AnimalMoment {
  /** Su modelo de Ashfox (tools/art/ashfox/models/terrain.mjs): 'frog', 'bird', 'goose'... */
  readonly animal: string;
  readonly act: AnimalAct;
  readonly at: Readonly<Point3>;
}

/** Quien oye lo que hacen los animales. */
export type AnimalListener = (moment: AnimalMoment) => void;
