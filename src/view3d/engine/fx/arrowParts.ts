/**
 * Las piezas de una flecha por el suelo, comunes a la del camino al mover (movePreview.ts) y a las de
 * lo que haran las ordenes (intentArrows.ts): tramos entre casillas y una punta. Dos estilos: fina
 * (las ordenes, un dibujo en el suelo) y de bloques (el camino, una pieza de juguete con grosor).
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';

/** Como es una flecha (casillas). */
export interface ArrowStyle {
  /** Por encima del suelo: sobre las marcas de alcance y el cursor. */
  readonly lift: number;
  readonly width: number;
  readonly thickness: number;
  /** La punta: lo ancha y lo larga que es. */
  readonly headWidth: number;
  readonly headLength: number;
}

/** Una raya en el suelo, con la punta plana. */
export const THIN_ARROW: ArrowStyle = { lift: 0.05, width: 0.14, thickness: 0.02, headWidth: 0.38, headLength: 0.32 };
/** Una flecha de bloques, con grosor (la punta tambien), sobre las losas del alcance. */
export const BLOCK_ARROW: ArrowStyle = { lift: 0.09, width: 0.2, thickness: 0.07, headWidth: 0.48, headLength: 0.38 };
/** Su contorno de tinta: algo mas ancha y algo mas baja, debajo de la de bloques. */
export const BLOCK_ARROW_INK: ArrowStyle = { lift: 0.085, width: 0.3, thickness: 0.05, headWidth: 0.64, headLength: 0.5 };

const FORWARD = new THREE.Vector3(0, 0, 1);

/** Un material de flecha; a dos caras: la punta es un triangulo plano y se ve desde arriba aunque mire al suelo. */
export const arrowMaterial = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

/** Los puntos de un camino, a la altura de la flecha. */
export const arrowPoints = (path: readonly Pos[], groundOf: (pos: Pos) => THREE.Vector3, style = THIN_ARROW): THREE.Vector3[] =>
  path.map((pos) => groundOf(pos).add(new THREE.Vector3(0, style.lift, 0)));

/** Un tramo de flecha de un punto a otro: una caja (de lado 1) estirada entre los dos. */
export function segmentMatrix(from: THREE.Vector3, to: THREE.Vector3, style = THIN_ARROW): THREE.Matrix4 {
  const delta = to.clone().sub(from);
  const middle = from.clone().addScaledVector(delta, 0.5);
  const turn = new THREE.Quaternion().setFromUnitVectors(FORWARD, delta.clone().normalize());
  const size = new THREE.Vector3(style.width, style.thickness, delta.length() + style.width);
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

/**
 * Un triangulo que apunta hacia +z, con la base en el centro de la casilla: plano en la fina, con
 * grosor (su `thickness`, centrado en la altura de la flecha) en la de bloques.
 */
export function arrowHeadGeometry(style = THIN_ARROW): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-style.headWidth / 2, 0);
  shape.lineTo(style.headWidth / 2, 0);
  shape.lineTo(0, style.headLength);
  shape.closePath();
  const isFlat = style === THIN_ARROW;
  const geometry = isFlat
    ? new THREE.ShapeGeometry(shape)
    : new THREE.ExtrudeGeometry(shape, { depth: style.thickness, bevelEnabled: false });
  // De pie en el plano xy a tumbado en el suelo, apuntando hacia +z (el grosor queda hacia abajo).
  geometry.rotateX(Math.PI / 2);
  if (!isFlat) geometry.translate(0, style.thickness / 2, 0);
  return geometry;
}

/** Una caja de lado 1 para los tramos (se estira con segmentMatrix). */
export const segmentGeometry = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1);
