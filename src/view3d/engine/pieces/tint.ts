/**
 * Oscurecer una pieza (la que ya ha jugado, los restos quemados) sin estropear los materiales que
 * comparten las demas.
 */
import * as THREE from 'three';
import { toonMaterial } from '../../toon';

/** El color de partida de una pieza (lo apunta la primera vez, antes de oscurecerla). */
function baseColorOf(mesh: THREE.Object3D, material: THREE.MeshToonMaterial): THREE.Color {
  if (!(mesh.userData.baseColor instanceof THREE.Color)) mesh.userData.baseColor = material.color.clone();
  return mesh.userData.baseColor as THREE.Color;
}

/** Pone las piezas de un modelo a ese tanto de su color (1: el suyo), con los materiales compartidos de toon.ts. */
export function tint(object: THREE.Object3D, scale: number): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh;
    if (!(mesh.material instanceof THREE.MeshToonMaterial)) return;
    // Con textura (GLB) el material es solo de esta pieza: basta con oscurecer su color.
    if (mesh.material.map) return void mesh.material.color.setScalar(scale);
    mesh.material = toonMaterial(baseColorOf(mesh, mesh.material).clone().multiplyScalar(scale));
  });
}
