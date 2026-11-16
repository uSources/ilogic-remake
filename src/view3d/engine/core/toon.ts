/**
 * El aspecto cartoon, todo con la luz (sin contornos): materiales de dos tonos con el salto seco
 * (MeshToonMaterial con una rampa de luz/sombra) y una sombra de color frio que pone el cielo. Todo
 * lo que se dibuja en 3D saca sus materiales de aqui, asi el estilo se cambia en un sitio.
 */
import * as THREE from 'three';

/**
 * La rampa de luz, de la cara de espaldas al sol a la que le da de lleno. La sombra ocupa la mitad
 * oscura (cara de lado o de espaldas) y la luz la otra: dos tonos, sin degradado.
 */
const TOON_RAMP = [0.32, 0.32, 1, 1] as const;

function rampTexture(): THREE.DataTexture {
  const levels = TOON_RAMP.map((level) => Math.round(level * 255));
  const texture = new THREE.DataTexture(new Uint8Array(levels), levels.length, 1, THREE.RedFormat);
  // Sin mezclar entre tonos: el paso de luz a sombra es seco.
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const ramp = rampTexture();
const toonMaterials = new Map<string, THREE.MeshToonMaterial>();

/** El material cartoon de ese color (uno por color: se comparten entre piezas). */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  const key = new THREE.Color(color).getHexString();
  let material = toonMaterials.get(key);
  if (!material) {
    material = new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    toonMaterials.set(key, material);
  }
  return material;
}

/** Un bloque cartoon que da y recibe sombra. */
export function toonBox(size: THREE.Vector3Tuple, color: THREE.ColorRepresentation): THREE.Mesh {
  const block = new THREE.Mesh(new THREE.BoxGeometry(...size), toonMaterial(color));
  block.castShadow = true;
  block.receiveShadow = true;
  return block;
}

/**
 * El material cartoon con una textura (los modelos GLB de Ashfox, con su pixel art). Uno por pieza:
 * se oscurece cuando la unidad ya ha jugado (su `color`), sin tocar las demas.
 */
export function toonTextured(map: THREE.Texture): THREE.MeshToonMaterial {
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  return new THREE.MeshToonMaterial({ map, gradientMap: ramp });
}
