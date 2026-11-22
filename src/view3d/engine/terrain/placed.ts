/**
 * Las copias de los modelos del terreno (casillas, decorado, ranas): cada clase de modelo es una malla
 * instanciada, y cada copia sabe de que casilla es para oscurecerla con la niebla si no se ve.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { Grid } from '../../../core/util/grid';
import type { GlbLibrary } from '../pieces/glbModels';

/** Las casillas en la niebla: mas oscuras y algo azuladas (como de noche), sin dejar de leerse. */
const FOG_TINT = new THREE.Color(0.52, 0.56, 0.72);
const SEEN = new THREE.Color(1, 1, 1);

/** Una malla instanciada con las casillas a las que pertenece cada copia (para la niebla y para tocar). */
export interface PlacedMesh {
  mesh: THREE.InstancedMesh;
  positions: readonly Pos[];
  /** Donde va esta pieza dentro de su modelo (para mover una copia: `moveCopy`). */
  part: THREE.Matrix4;
}

/** Un numero entre 0 y 1 que sale siempre igual para la misma casilla (para variar sin azar). */
export function tileNoise(pos: Pos, salt: number): number {
  const value = Math.sin(pos.x * 127.1 + pos.y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Copias de un modelo de Ashfox, una por sitio (`places`: donde va y como gira cada una). */
export function instanced(library: GlbLibrary, file: string, positions: readonly Pos[], places: readonly THREE.Matrix4[]): PlacedMesh[] {
  return library.staticParts(`terrain/${file}`).map((part) => {
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, places.length);
    places.forEach((place, index) => {
      mesh.setMatrixAt(index, place.clone().multiply(part.matrix));
      mesh.setColorAt(index, SEEN);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return { mesh, positions, part: part.matrix };
  });
}

const moved = new THREE.Matrix4();

/** Lleva la copia `index` a otro sitio (lo que se mueve: las ranas que saltan). */
export function moveCopy(placed: PlacedMesh, index: number, place: THREE.Matrix4): void {
  placed.mesh.setMatrixAt(index, moved.multiplyMatrices(place, placed.part));
  placed.mesh.instanceMatrix.needsUpdate = true;
}

/** Oscurece las copias de las casillas que no se ven y aclara las que si. */
export function shade(placed: readonly PlacedMesh[], seen: Grid<boolean>): void {
  for (const { mesh, positions } of placed) {
    positions.forEach((pos, index) => mesh.setColorAt(index, seen.at(pos) ? SEEN : FOG_TINT));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/** El color de lo que no se ve, sobre el suyo (el relieve, que no son copias de un modelo). */
export const fogged = (color: THREE.Color): THREE.Color => color.multiply(FOG_TINT);
