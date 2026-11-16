/**
 * Las piezas de una flecha por el suelo, comunes a la del camino al mover (movePreview.ts) y a las de
 * lo que haran las ordenes (intentArrows.ts): tramos entre casillas y una punta plana.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';

/** Por encima del suelo (casillas): sobre las marcas de alcance y el cursor. */
const ARROW_LIFT = 0.05;
const ARROW_WIDTH = 0.14;
const ARROW_THICKNESS = 0.02;
/** La punta de la flecha: lo ancha y lo larga que es. */
const HEAD_WIDTH = 0.38;
const HEAD_LENGTH = 0.32;

const FORWARD = new THREE.Vector3(0, 0, 1);

/** Un material de flecha; a dos caras: la punta es un triangulo plano y se ve desde arriba aunque mire al suelo. */
export const arrowMaterial = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

/** Los puntos de un camino, a la altura de la flecha. */
export const arrowPoints = (path: readonly Pos[], groundOf: (pos: Pos) => THREE.Vector3): THREE.Vector3[] =>
  path.map((pos) => groundOf(pos).add(new THREE.Vector3(0, ARROW_LIFT, 0)));

/** Un tramo de flecha de un punto a otro: una caja (de lado 1) estirada entre los dos. */
export function segmentMatrix(from: THREE.Vector3, to: THREE.Vector3): THREE.Matrix4 {
  const delta = to.clone().sub(from);
  const middle = from.clone().addScaledVector(delta, 0.5);
  const turn = new THREE.Quaternion().setFromUnitVectors(FORWARD, delta.clone().normalize());
  const size = new THREE.Vector3(ARROW_WIDTH, ARROW_THICKNESS, delta.length() + ARROW_WIDTH);
  return new THREE.Matrix4().compose(middle, turn, size);
}

/** Cada punto con el siguiente: los tramos de la flecha. */
export const segmentsOf = (points: readonly THREE.Vector3[]): [THREE.Vector3, THREE.Vector3][] =>
  points.slice(1).map((to, index) => [points[index]!, to]);

/** Donde va la punta (en el ultimo punto) y hacia donde mira (la direccion del ultimo tramo). */
export function headMatrix(points: readonly THREE.Vector3[]): THREE.Matrix4 {
  const end = points.at(-1)!;
  const before = points.at(-2)!;
  const direction = end.clone().sub(before).setY(0).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(FORWARD, direction);
  return new THREE.Matrix4().compose(end, turn, new THREE.Vector3(1, 1, 1));
}

/** Un triangulo plano que apunta hacia +z, con la base en el centro de la casilla. */
export function arrowHeadGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-HEAD_WIDTH / 2, 0);
  shape.lineTo(HEAD_WIDTH / 2, 0);
  shape.lineTo(0, HEAD_LENGTH);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // De pie en el plano xy a tumbado en el suelo, apuntando hacia +z.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Una caja de lado 1 para los tramos (se estira con segmentMatrix). */
export const segmentGeometry = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1);
