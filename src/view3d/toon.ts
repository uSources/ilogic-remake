/**
 * El aspecto cartoon: materiales con pocas bandas de luz (MeshToonMaterial con una rampa de pocos
 * tonos) y un contorno oscuro por "casco invertido" (una copia algo mayor, solo con sus caras de
 * atras). Todo lo que se dibuja en 3D saca sus materiales de aqui, asi el estilo se cambia en un sitio.
 */
import * as THREE from 'three';

/** Brillo de cada banda de la rampa, de la sombra a la luz: tres bandas, como un dibujo animado. */
const TOON_BANDS = [0.45, 0.75, 1] as const;
/** Color del contorno: casi negro y algo azulado, menos duro que el negro puro. */
const OUTLINE_COLOR = 0x141a2b;
/** Cuanto mas grande es el casco del contorno que la pieza (en unidades del mundo). */
export const OUTLINE_WIDTH = 0.03;
/** En piezas finas (un mastil, una antena) el contorno no pasa de esta parte de su lado mas estrecho: si no, se comeria la pieza. */
const OUTLINE_MAX_SHARE = 0.25;

/** El tamaño del casco del contorno de un bloque de ese tamaño. */
export function hullSize(size: THREE.Vector3Tuple): THREE.Vector3Tuple {
  const width = Math.min(OUTLINE_WIDTH, Math.min(...size) * OUTLINE_MAX_SHARE);
  return [size[0] + width * 2, size[1] + width * 2, size[2] + width * 2];
}

function bandsTexture(): THREE.DataTexture {
  const levels = TOON_BANDS.map((band) => Math.round(band * 255));
  const texture = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  // Sin mezclar entre bandas: el salto de luz a sombra es seco.
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const bands = bandsTexture();
const toonMaterials = new Map<string, THREE.MeshToonMaterial>();

/** El material cartoon de ese color (uno por color: se comparten entre piezas). */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  const key = new THREE.Color(color).getHexString();
  let material = toonMaterials.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({ color, gradientMap: bands });
    toonMaterials.set(key, material);
  }
  return material;
}

/** El material del contorno (el mismo para todo). */
export const outlineMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide });

/** Un bloque con su contorno: la caja y, dentro del mismo grupo, su casco algo mayor. */
export function outlinedBox(size: THREE.Vector3Tuple, color: THREE.ColorRepresentation): THREE.Group {
  const [width, height, depth] = size;
  const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), toonMaterial(color));
  block.castShadow = true;
  block.receiveShadow = true;
  const hull = new THREE.Mesh(new THREE.BoxGeometry(...hullSize(size)), outlineMaterial);
  const group = new THREE.Group();
  group.add(block, hull);
  return group;
}
