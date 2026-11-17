/**
 * Las columnas de voxels de un relieve juntas en una sola geometria, solo con las caras que se ven:
 * la de arriba de cada columna y las laderas que quedan al aire (sin vecina, o con una mas baja).
 * Las caras pegadas a una columna igual o mas alta, y la base, no se dibujan: son la mayor parte de
 * los cubos y no se ven. El color va por vertice (el de cada columna).
 */
import * as THREE from 'three';
import { SUBCELLS } from './reliefGrid';

/** Una columna en el mundo: su centro, su media anchura, su base, su cara de arriba y su color. */
export interface Column {
  center: THREE.Vector3;
  half: number;
  bottom: number;
  top: number;
  color: THREE.Color;
}

/** Las columnas de una malla instanciada, con su transformacion ya aplicada. */
export function columnsOf(mesh: THREE.InstancedMesh): Column[] {
  mesh.updateMatrix();
  const columns: Column[] = [];
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < mesh.count; index++) {
    mesh.getMatrixAt(index, matrix);
    matrix.premultiply(mesh.matrix);
    const center = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(center, rotation, scale);
    const color = new THREE.Color();
    mesh.getColorAt(index, color);
    columns.push({ center, half: scale.x / 2, bottom: center.y - scale.y / 2, top: center.y + scale.y / 2, color });
  }
  return columns;
}

/** La clave de la casilla de la rejilla de subcasillas donde cae una columna (su centro es x.5 en esa rejilla). */
const cellKey = (x: number, z: number): string => `${Math.floor(x * SUBCELLS)},${Math.floor(z * SUBCELLS)}`;

/** Las alturas de cada columna, por su celda, para saber que vecinas la tapan. */
function topsByCell(columns: readonly Column[]): Map<string, number> {
  return new Map(columns.map((column) => [cellKey(column.center.x, column.center.z), column.top]));
}

/** Los vertices de una cara (cuatro esquinas en orden alrededor), con su normal y su color: dos triangulos. */
class FaceBuffer {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];

  addQuad(corners: readonly THREE.Vector3[], normal: THREE.Vector3, color: THREE.Color): void {
    const [a, b, c, d] = corners as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
    // Se da la vuelta si las esquinas no miran hacia la normal (la cara se ve por fuera).
    const turn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const order = turn.dot(normal) >= 0 ? [a, b, c, a, c, d] : [a, d, c, a, c, b];
    for (const vertex of order) this.addVertex(vertex, normal, color);
  }

  private addVertex(vertex: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color): void {
    this.positions.push(vertex.x, vertex.y, vertex.z);
    this.normals.push(normal.x, normal.y, normal.z);
    this.colors.push(color.r, color.g, color.b);
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    return geometry;
  }
}

/** La cara de arriba de una columna. */
function addTop(faces: FaceBuffer, { center, half, top, color }: Column): void {
  const { x, z } = center;
  const corners = [
    new THREE.Vector3(x - half, top, z - half),
    new THREE.Vector3(x + half, top, z - half),
    new THREE.Vector3(x + half, top, z + half),
    new THREE.Vector3(x - half, top, z + half),
  ];
  faces.addQuad(corners, new THREE.Vector3(0, 1, 0), color);
}

/** La ladera de una columna hacia una direccion horizontal (n), de su base a su cara de arriba. */
function addSide(faces: FaceBuffer, column: Column, normal: THREE.Vector3): void {
  const { center, half, bottom, top, color } = column;
  const outside = new THREE.Vector3(center.x, 0, center.z).addScaledVector(normal, half);
  const across = new THREE.Vector3(Math.abs(normal.z), 0, Math.abs(normal.x)).multiplyScalar(half);
  const corners = [
    outside.clone().sub(across).setY(bottom),
    outside.clone().sub(across).setY(top),
    outside.clone().add(across).setY(top),
    outside.clone().add(across).setY(bottom),
  ];
  faces.addQuad(corners, normal, color);
}

const SIDE_NORMALS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];

/** Una geometria con solo las caras que se ven de todas las columnas (todas las que se tocan entre si). */
export function visibleFacesGeometry(columns: readonly Column[]): THREE.BufferGeometry {
  const tops = topsByCell(columns);
  const faces = new FaceBuffer();
  for (const column of columns) {
    addTop(faces, column);
    for (const normal of SIDE_NORMALS) {
      const neighborTop = tops.get(cellKey(column.center.x + normal.x / SUBCELLS, column.center.z + normal.z / SUBCELLS));
      if (neighborTop === undefined || neighborTop < column.top) addSide(faces, column, normal);
    }
  }
  return faces.toGeometry();
}
