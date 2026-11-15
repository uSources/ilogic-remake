/**
 * Muchas copias del mismo modelo de bloques (los arboles de todo un mapa) en pocas llamadas de
 * dibujo: una malla instanciada por bloque del modelo, con una copia por
 * sitio. Asi un mapa grande lleno de decorado cuesta casi lo mismo que uno pequeño.
 */
import * as THREE from 'three';
import { colorOf, type Block, type BlockModel, type TeamPaint } from './blocks';
import { toonMaterial } from './toon';

/** Donde va el bloque dentro del modelo (la base del bloque en `at`). */
function blockOffset(block: Block): THREE.Matrix4 {
  const [x, y, z] = block.at;
  return new THREE.Matrix4().makeTranslation(x, y + block.size[1] / 2, z);
}

function instancedMesh(geometry: THREE.BufferGeometry, material: THREE.Material, offset: THREE.Matrix4, places: readonly THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(geometry, material, places.length);
  places.forEach((place, index) => mesh.setMatrixAt(index, place.clone().multiply(offset)));
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function blockCopies(block: Block, teamPaint: TeamPaint, places: readonly THREE.Matrix4[]): THREE.InstancedMesh {
  const material = toonMaterial(colorOf(block.paint, teamPaint));
  const copies = instancedMesh(new THREE.BoxGeometry(...block.size), material, blockOffset(block), places);
  copies.castShadow = true;
  copies.receiveShadow = true;
  return copies;
}

/** Una copia del modelo en cada sitio (`places`: donde va y como gira cada una). */
export function instancedModel(model: BlockModel, teamPaint: TeamPaint, places: readonly THREE.Matrix4[]): THREE.Group {
  const group = new THREE.Group();
  if (places.length === 0) return group;
  for (const block of model.blocks) group.add(blockCopies(block, teamPaint, places));
  return group;
}
