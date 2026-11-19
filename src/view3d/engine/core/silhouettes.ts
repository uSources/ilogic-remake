/**
 * Las siluetas de las unidades tapadas: donde una montaña, un edificio o un arbol tapa una unidad desde
 * la camara, se ve su silueta del color de su lado a traves (como en casi todos los juegos de estrategia
 * en 3D). Asi no se pierde ninguna detras del relieve.
 *
 * Se dibuja despues de la escena, solo con las unidades (sus mallas van tambien en la capa de su color):
 * 1. Marca en el stencil los pixeles donde cada unidad se ve de verdad (su misma profundidad o delante).
 * 2. Pinta cada color donde la unidad queda detras de algo (profundidad mayor) y no hay una unidad que se
 *    vea: asi una unidad no se pinta encima de si misma (sus piezas de detras) ni de otra que esta delante.
 *    Cada pixel se pinta una vez (lo marca al pintarlo): si no, donde se cruzan sus piezas saldria mas oscuro.
 */
import * as THREE from 'three';
import type { OwnerSide } from '../../../ui/sides';

/** El color de la silueta de cada lado (los de la interfaz: azul lo propio y aliado, rojo lo enemigo). */
const SILHOUETTE_COLORS = { friendly: 0x3aa8ff, enemy: 0xff4d45, neutral: 0xc9d2e3 } as const;
type SilhouettePaint = keyof typeof SILHOUETTE_COLORS;
const PAINT_OF_SIDE: Readonly<Record<OwnerSide, SilhouettePaint>> = {
  own: 'friendly',
  ally: 'friendly',
  enemy: 'enemy',
  neutral: 'neutral',
};
/** La capa de cada color (la 0 es la de siempre: lo que dibuja la escena). */
const SILHOUETTE_LAYERS: Readonly<Record<SilhouettePaint, number>> = { friendly: 1, enemy: 2, neutral: 3 };
/** Lo que deja ver de lo que tapa: lo justo para que la silueta se lea sin parecer que esta delante. */
const SILHOUETTE_OPACITY = 0.6;
/** El valor del stencil donde se ve una unidad o ya hay silueta: ahi no se pinta. */
const TAKEN = 1;

/** Las mallas de esta unidad se veran en silueta cuando algo las tape. */
export function showThroughWalls(object: THREE.Object3D, side: OwnerSide): void {
  const layer = SILHOUETTE_LAYERS[PAINT_OF_SIDE[side]];
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) node.layers.enable(layer);
  });
}

/** Ya no tiene silueta (los restos de una unidad destruida, que se copian de ella). */
export function hideThroughWalls(object: THREE.Object3D): void {
  object.traverse((node) => node.layers.set(0));
}

export class Silhouettes {
  /** Marca donde se ve cada unidad: no pinta, solo escribe el stencil. */
  private readonly seenMask = seenMaskMaterial();
  private readonly fills = new Map(
    (Object.keys(SILHOUETTE_COLORS) as SilhouettePaint[]).map((paint) => [paint, fillMaterial(SILHOUETTE_COLORS[paint])]),
  );

  /** Las siluetas, encima de la escena ya dibujada (con su profundidad y su stencil). */
  draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const saved = {
      mask: camera.layers.mask,
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.autoUpdate,
      background: scene.background,
    };
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    camera.layers.disableAll();
    for (const layer of Object.values(SILHOUETTE_LAYERS)) camera.layers.enable(layer);
    renderWith(renderer, scene, camera, this.seenMask);
    for (const [paint, fill] of this.fills) {
      camera.layers.set(SILHOUETTE_LAYERS[paint]);
      renderWith(renderer, scene, camera, fill);
    }
    camera.layers.mask = saved.mask;
    renderer.autoClear = saved.autoClear;
    renderer.shadowMap.autoUpdate = saved.shadows;
    scene.background = saved.background;
  }
}

function renderWith(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, material: THREE.Material): void {
  scene.overrideMaterial = material;
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
}

function seenMaskMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, fog: false });
  material.depthFunc = THREE.LessEqualDepth;
  // Un pelo hacia la camara: con otro sombreador la profundidad puede no salir identica a la de la escena.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -4;
  material.stencilWrite = true;
  material.stencilRef = TAKEN;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
  return material;
}

function fillMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: SILHOUETTE_OPACITY, depthWrite: false, fog: false });
  material.depthFunc = THREE.GreaterDepth;
  material.stencilWrite = true;
  // Pasa solo donde el stencil esta a 0 (TAKEN > stencil) y, al pintar, lo deja en TAKEN.
  material.stencilRef = TAKEN;
  material.stencilFunc = THREE.GreaterStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
  return material;
}
