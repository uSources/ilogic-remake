/**
 * Un modelo recortado por debajo de una altura: lo que queda de un bloque cuando solo hace falta su
 * parte de arriba (las copias apiladas bajo las casillas altas, terrain.ts). Los vertices de debajo
 * suben hasta el corte y su textura se recorta con ellos, sin estirarse: los pixeles siguen del mismo
 * tamaño que en el bloque entero.
 */
import * as THREE from 'three';
import type { StaticPart } from '../pieces/glbModels';

/** Lo que pueden diferir dos coordenadas de un GLB y ser la misma. */
const SAME_SPOT = 1e-4;

/** Los vertices de cada triangulo (con indice o sin el). */
function triangles(geometry: THREE.BufferGeometry): number[][] {
  const index = geometry.index;
  const corners = index ? index.count : geometry.getAttribute('position').count;
  const vertexAt = (corner: number): number => (index ? index.getX(corner) : corner);
  return Array.from({ length: corners / 3 }, (_, triangle) => [0, 1, 2].map((corner) => vertexAt(triangle * 3 + corner)));
}

/** Con que vertices comparte triangulo cada uno (en un cuadrado partido en dos, cada esquina con sus dos vecinas). */
function triangleMates(geometry: THREE.BufferGeometry): Map<number, Set<number>> {
  const mates = new Map<number, Set<number>>();
  for (const corners of triangles(geometry))
    for (const vertex of corners) {
      const known = mates.get(vertex) ?? new Set<number>();
      corners.filter((other) => other !== vertex).forEach((other) => known.add(other));
      mates.set(vertex, known);
    }
  return mates;
}

/** Si `mate` esta en la misma vertical que `vertex` y por encima del corte: el otro extremo de su lado de la cara. */
function isAboveOnSameEdge(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  vertex: number,
  mate: number,
  floor: number,
): boolean {
  const sameColumn =
    Math.abs(position.getX(mate) - position.getX(vertex)) < SAME_SPOT && Math.abs(position.getZ(mate) - position.getZ(vertex)) < SAME_SPOT;
  return sameColumn && position.getY(mate) >= floor;
}

/** La textura del punto del lado que queda en el corte (entre `vertex`, debajo, y `above`): lo que se ve ahi del bloque entero. */
function textureAtCut(geometry: THREE.BufferGeometry, vertex: number, above: number, floor: number): void {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!uv) return;
  const shareFromAbove = (position.getY(above) - floor) / (position.getY(above) - position.getY(vertex));
  const lerp = (top: number, bottom: number): number => THREE.MathUtils.lerp(top, bottom, shareFromAbove);
  uv.setXY(vertex, lerp(uv.getX(above), uv.getX(vertex)), lerp(uv.getY(above), uv.getY(vertex)));
}

/** Una copia de la geometria sin lo que queda por debajo de `floor`. */
export function cutBelow(source: THREE.BufferGeometry, floor: number): THREE.BufferGeometry {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const mates = triangleMates(geometry);
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (position.getY(vertex) >= floor) continue;
    // La cara de abajo no tiene vertice encima: sube sin mas (no se ve).
    const above = [...(mates.get(vertex) ?? [])].find((mate) => isAboveOnSameEdge(position, vertex, mate, floor));
    if (above !== undefined) textureAtCut(geometry, vertex, above, floor);
    position.setY(vertex, floor);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Una pieza de un modelo recortada por debajo de `floor`, medido en el modelo (con la pieza ya puesta en su sitio dentro de el). */
export function cutPartBelow(part: StaticPart, floor: number): StaticPart {
  const inModel = part.geometry.clone().applyMatrix4(part.matrix);
  return { geometry: cutBelow(inModel, floor), material: part.material, matrix: new THREE.Matrix4() };
}
