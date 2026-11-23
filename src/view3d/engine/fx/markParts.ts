/**
 * Las piezas de las marcas del tablero (highlights.ts), con aire de juguete: losas de plastico que se
 * apoyan en la casilla, tiras para los bordes, el cursor de cuatro esquinas con su contorno de tinta y
 * la diana de pixel de los enemigos a tiro. Aqui solo se hacen; donde van lo dice highlights.ts.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Pos } from '../../../core/model';
import { SIDE_STEPS, type TileSide } from './tileOutline';

/** La tinta de las fichas de la interfaz (`--ink`): contorno que se lee sobre nieve, arena o hierba. */
export const INK_COLOR = 0x2b2240;
/** Grosor de una losa (casillas): se ve como una pieza encima, no como pintura. */
export const SLAB_HEIGHT = 0.035;
/** Ancho de una tira de borde (casillas). */
export const STRIP_WIDTH = 0.07;
const STRIP_HEIGHT = 0.05;

/** Una malla de muchas piezas iguales, empezando vacia. */
export function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, max: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.count = 0;
  // Su esfera de recorte se calcula una vez, vacia: sin esto no se veria nunca.
  mesh.frustumCulled = false;
  return mesh;
}

/** Los numeros de la matriz de cada pieza (4 x 4). */
const MATRIX_SIZE = 16;

/**
 * Hace sitio en la malla para `needed` piezas si no caben (sobre el relieve una marca va en trozos, y
 * no se sabe cuantos hasta verla). Crece su bufer, no la malla: sigue en su sitio de la escena y se
 * pinta en el mismo orden (las translucidas a la misma distancia van por orden de creacion). `dispose`
 * suelta el bufer de antes en la tarjeta grafica.
 */
export function makeRoomFor(mesh: THREE.InstancedMesh, needed: number): void {
  const capacity = mesh.instanceMatrix.count;
  if (needed <= capacity) return;
  mesh.dispose();
  const grown = Math.max(needed, capacity * 2);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(grown * MATRIX_SIZE), MATRIX_SIZE);
}

/**
 * Un color plano (sin luz, como la interfaz). Los translucidos no escriben profundidad (no tapan lo que
 * hay detras); los opacos si, para que una losa translucida no se pinte encima de un borde que esta
 * por encima de ella.
 */
export const flatMaterial = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

/** Una caja de lado 1 con la base en y = 0 (se estira con la matriz de cada pieza). */
export function unitBox(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

/** La matriz de una losa de `size` (de 0 a 1 de la casilla) sobre el suelo `ground`. */
export function slabMatrix(ground: THREE.Vector3, size: number, height = SLAB_HEIGHT): THREE.Matrix4 {
  return new THREE.Matrix4().compose(ground, new THREE.Quaternion(), new THREE.Vector3(size, height, size));
}

/** El ancho y el alto de una tira (casillas): las de siempre, o mas gruesas para un borde que mande. */
export interface StripSize {
  readonly width: number;
  readonly height: number;
}

export const STRIP: StripSize = { width: STRIP_WIDTH, height: STRIP_HEIGHT };

/**
 * Una tira en el lado `side` de la casilla, a `inset` del centro (0,5: el borde de la casilla), de
 * largo `length`. Las tiras de norte y sur van a lo largo de x; las de este y oeste, de z.
 */
export function stripMatrix(ground: THREE.Vector3, side: TileSide, inset: number, length: number, strip = STRIP): THREE.Matrix4 {
  const step = SIDE_STEPS[side];
  const along = step.x === 0;
  const center = ground.clone().add(new THREE.Vector3(step.x * (inset - strip.width / 2), 0, step.y * (inset - strip.width / 2)));
  const size = new THREE.Vector3(along ? length : strip.width, strip.height, along ? strip.width : length);
  return new THREE.Matrix4().compose(center, new THREE.Quaternion(), size);
}

/** Las cuatro tiras de un marco cuadrado alrededor del centro de la casilla. */
export const frameSides: readonly TileSide[] = ['east', 'west', 'south', 'north'];

/** Una esquina en L (dos cajas) en la esquina de la casilla hacia `corner` (cada eje, -1 o 1). */
function cornerGeometry(corner: Pos, reach: number, arm: number, width: number, height: number): THREE.BufferGeometry {
  const x = corner.x * (reach - width / 2);
  const z = corner.y * (reach - width / 2);
  const alongX = new THREE.BoxGeometry(arm, height, width).translate(x - (corner.x * (arm - width)) / 2, height / 2, z);
  const alongZ = new THREE.BoxGeometry(width, height, arm).translate(x, height / 2, z - (corner.y * (arm - width)) / 2);
  return mergeGeometries([alongX, alongZ]);
}

const CORNERS: readonly Pos[] = [
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/** El cursor de la casilla señalada: cuatro esquinas amarillas sobre otras de tinta un poco mayores. */
export function cornerCursor(color: number): THREE.Group {
  const shape = (reach: number, arm: number, width: number, height: number) =>
    mergeGeometries(CORNERS.map((corner) => cornerGeometry(corner, reach, arm, width, height)));
  const ink = new THREE.Mesh(shape(0.54, 0.34, 0.14, 0.05), flatMaterial(INK_COLOR, 1));
  const bright = new THREE.Mesh(shape(0.51, 0.28, 0.08, 0.07), flatMaterial(color, 1));
  const cursor = new THREE.Group();
  cursor.add(ink, bright);
  cursor.visible = false;
  return cursor;
}

const BULLSEYE_PIXELS = 32;
/** De fuera a dentro: tinta, rojo, crema, rojo, crema, rojo (radios en pixeles). */
const BULLSEYE_RINGS: readonly [number, string][] = [
  [16, '#2b2240'],
  [14.5, '#ff4d45'],
  [11.5, '#fff6e3'],
  [8.5, '#ff4d45'],
  [5.5, '#fff6e3'],
  [3, '#ff4d45'],
];

/** La diana de pixel (cuadrados enteros, sin suavizar), como los iconos de la interfaz. */
function bullseyeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = BULLSEYE_PIXELS;
  canvas.height = BULLSEYE_PIXELS;
  const draw = canvas.getContext('2d')!;
  const middle = BULLSEYE_PIXELS / 2 - 0.5;
  for (let y = 0; y < BULLSEYE_PIXELS; y++) {
    for (let x = 0; x < BULLSEYE_PIXELS; x++) {
      const radius = Math.hypot(x - middle, y - middle);
      const ring = BULLSEYE_RINGS.filter(([outer]) => radius <= outer).at(-1);
      if (!ring) continue;
      draw.fillStyle = ring[1];
      draw.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Un plano tumbado (mirando arriba) con la diana: una pieza por enemigo a tiro. */
export function bullseyeMesh(max: number): THREE.InstancedMesh {
  const material = new THREE.MeshBasicMaterial({ map: bullseyeTexture(), transparent: true, alphaTest: 0.5, depthWrite: false });
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  return instanced(plane, material, max);
}
