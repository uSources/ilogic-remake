/**
 * Una unidad encima de un edificio: los dos comparten casilla y, en el centro, se atravesarian. Cada uno
 * se va a una esquina: la unidad a la de delante (la mas cerca de la camara) y el edificio, encogido, a
 * la de atras, para que se vean los dos (docs/ESTETICA.md, "Tamaños en el tablero"). Van por esquinas y
 * no siguiendo a la camara: si no, se moverian al desplazarla; solo cambian de esquina al girarla.
 */
import type * as THREE from 'three';

/** Lo rapido que se apartan (o vuelven) al llegar o irse una unidad (por segundo; mas, mas rapido). */
const SETTLING_RATE = 8;

/**
 * La esquina de la casilla que queda detras mirando hacia `cameraForward` (x y z de -1 o 1), en
 * `target`. La de delante es la contraria.
 */
export function backCornerOf(cameraForward: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target.set(cameraForward.x >= 0 ? 1 : -1, 0, cameraForward.z >= 0 ? 1 : -1);
}

/** Cuanto acercarse este fotograma a donde se va (0..1), para que llegue suave sea cual sea el ritmo. */
export function settlingShare(seconds: number): number {
  return 1 - Math.exp(-SETTLING_RATE * seconds);
}
