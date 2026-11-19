/**
 * El contorno de la unidad elegida (amarillo, como su anillo) y de la señalada (blanco): un borde de
 * pixeles alrededor de la figura, del mismo ancho de cerca y de lejos, que se ve aunque algo la tape.
 * Asi se sabe a cual se apunta aunque sea pequeña o este junto a otras.
 *
 * Se dibuja despues de la escena, solo con la unidad: se marca en el stencil toda su figura y luego se
 * pinta su color varias veces corrida unos pixeles hacia cada lado, solo fuera de la marca. Lo que queda
 * es el borde.
 */
import * as THREE from 'three';

/** El amarillo del anillo y del cursor (highlights.ts) para la elegida; blanco para la señalada. */
const SELECTED_COLOR = 0xffd447;
const HOVERED_COLOR = 0xffffff;
/** El ancho del borde, en pixeles de la pantalla (CSS: con mas densidad de pixeles, mas). */
const OUTLINE_PIXELS = 3;
/** Hacia donde se corre la figura para hacer el borde: las ocho direcciones. */
const OUTLINE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];
/** La capa de lo que lleva contorno en este momento (las 1-3 son de otras pasadas). */
const OUTLINE_LAYER = 4;
/** El valor del stencil donde esta la figura: ahi no se pinta el borde. */
const FIGURE = 2;

/** Las unidades con contorno: la elegida y la señalada (null: ninguna). */
export interface OutlinedUnits {
  readonly selected: THREE.Object3D | null;
  readonly hovered: THREE.Object3D | null;
}

export class UnitOutline {
  private readonly figureMask = figureMaskMaterial();
  private readonly selectedEdge = edgeMaterial(SELECTED_COLOR);
  private readonly hoveredEdge = edgeMaterial(HOVERED_COLOR);
  private readonly projection = new THREE.Matrix4();
  private readonly shift = new THREE.Matrix4();
  private readonly drawingSize = new THREE.Vector2();

  /** Los contornos, encima de la escena ya dibujada. La elegida, la ultima: si es la misma, gana su color. */
  draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, units: OutlinedUnits): void {
    if (units.hovered && units.hovered !== units.selected) this.outline(renderer, scene, camera, units.hovered, this.hoveredEdge);
    if (units.selected) this.outline(renderer, scene, camera, units.selected, this.selectedEdge);
  }

  private outline(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    unit: THREE.Object3D,
    edge: THREE.Material,
  ): void {
    const saved = {
      mask: camera.layers.mask,
      autoClear: renderer.autoClear,
      shadows: renderer.shadowMap.autoUpdate,
      background: scene.background,
    };
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    renderer.clearStencil();
    setLayer(unit, true);
    camera.layers.set(OUTLINE_LAYER);
    renderWith(renderer, scene, camera, this.figureMask);
    this.drawShifted(renderer, scene, camera, edge);
    setLayer(unit, false);
    camera.layers.mask = saved.mask;
    renderer.autoClear = saved.autoClear;
    renderer.shadowMap.autoUpdate = saved.shadows;
    scene.background = saved.background;
  }

  /** La figura corrida unos pixeles hacia cada lado: el borde que sobresale de la marca. */
  private drawShifted(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, edge: THREE.Material): void {
    this.projection.copy(camera.projectionMatrix);
    renderer.getDrawingBufferSize(this.drawingSize);
    const pixels = OUTLINE_PIXELS * renderer.getPixelRatio();
    for (const [x, y] of OUTLINE_DIRECTIONS) {
      // Correr en la pantalla: sumar en x e y del recorte un tanto de w (tras dividir por w, un desplazamiento fijo).
      this.shift.makeTranslation((2 * pixels * x) / this.drawingSize.x, (2 * pixels * y) / this.drawingSize.y, 0);
      camera.projectionMatrix.multiplyMatrices(this.shift, this.projection);
      renderWith(renderer, scene, camera, edge);
    }
    camera.projectionMatrix.copy(this.projection);
  }
}

/** Pone o quita la capa del contorno a las mallas de la unidad. */
function setLayer(unit: THREE.Object3D, outlined: boolean): void {
  unit.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (outlined) node.layers.enable(OUTLINE_LAYER);
    else node.layers.disable(OUTLINE_LAYER);
  });
}

function renderWith(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, material: THREE.Material): void {
  scene.overrideMaterial = material;
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
}

/** Marca toda la figura (tambien lo tapado): no pinta. */
function figureMaskMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, fog: false });
  material.stencilWrite = true;
  material.stencilRef = FIGURE;
  material.stencilFunc = THREE.AlwaysStencilFunc;
  material.stencilZPass = THREE.ReplaceStencilOp;
  return material;
}

/** El color del borde, solo fuera de la figura y por encima de todo (se ve aunque algo la tape). */
function edgeMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color, depthWrite: false, depthTest: false, fog: false });
  material.stencilWrite = true;
  material.stencilRef = FIGURE;
  material.stencilFunc = THREE.NotEqualStencilFunc;
  return material;
}
