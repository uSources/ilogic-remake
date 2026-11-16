/**
 * A donde llegaria la unidad elegida (ports/turn.ts, `MovePreview`): una flecha por el suelo a lo
 * largo del camino y, al final, un fantasma de la unidad (su modelo, translucido) mirando hacia donde
 * llega. Solo dibuja lo que se le dice: el camino lo decide systems/turn/movePreview.ts.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { MoveLook, MovePreview } from '../../ports/turn';
import { facingAngle } from '../core/space';
import type { UnitPiece } from '../pieces/unitPiece';

const ARROW_COLOR = 0xffd447;
const ARROW_OPACITY = 0.9;
/** Por encima del suelo (casillas): sobre las marcas de alcance y el cursor. */
const ARROW_LIFT = 0.05;
const ARROW_WIDTH = 0.14;
const ARROW_THICKNESS = 0.02;
/** La punta de la flecha: lo ancha y lo larga que es. */
const HEAD_WIDTH = 0.38;
const HEAD_LENGTH = 0.32;
/** Un camino no tiene mas pasos que esto (el movimiento mas largo cabe de sobra). */
const MAX_SEGMENTS = 64;
const GHOST_OPACITY = 0.45;

/** Lo que necesita: el suelo de cada casilla y la pieza de cada unidad (para copiar su modelo). */
export interface MovePreviewBoard {
  groundOf(pos: Pos): THREE.Vector3;
  pieceOf(uid: number): UnitPiece | undefined;
}

const FORWARD = new THREE.Vector3(0, 0, 1);

export class MovePreviewView implements MovePreview {
  readonly object = new THREE.Group();
  private readonly segments: THREE.InstancedMesh;
  private readonly head: THREE.Mesh;
  private ghost: { uid: number; object: THREE.Object3D } | null = null;

  constructor(private readonly board: MovePreviewBoard) {
    // A dos caras: la punta es un triangulo plano y se ve desde arriba aunque mire al suelo.
    const material = new THREE.MeshBasicMaterial({
      color: ARROW_COLOR,
      transparent: true,
      opacity: ARROW_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.segments = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_SEGMENTS);
    this.segments.frustumCulled = false;
    this.segments.count = 0;
    this.head = new THREE.Mesh(arrowHeadGeometry(), material);
    this.object.add(this.segments, this.head);
    this.show(null);
  }

  show(look: MoveLook | null): void {
    const hasPath = !!look && look.path.length > 1;
    this.segments.visible = hasPath;
    this.head.visible = hasPath;
    if (!look || !hasPath) return this.hideGhost();
    const points = look.path.map((pos) => this.board.groundOf(pos).add(new THREE.Vector3(0, ARROW_LIFT, 0)));
    this.drawSegments(points);
    this.drawHead(points);
    this.placeGhost(look);
  }

  private drawSegments(points: readonly THREE.Vector3[]): void {
    const steps = points.slice(1, MAX_SEGMENTS + 1).map((to, index) => [points[index]!, to] as const);
    steps.forEach(([from, to], index) => this.segments.setMatrixAt(index, segmentMatrix(from, to)));
    this.segments.count = steps.length;
    this.segments.instanceMatrix.needsUpdate = true;
  }

  /** La punta, en la casilla de llegada, hacia donde se llega. */
  private drawHead(points: readonly THREE.Vector3[]): void {
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    const direction = end.clone().sub(before).setY(0).normalize();
    this.head.position.copy(end);
    this.head.quaternion.setFromUnitVectors(FORWARD, direction);
  }

  private placeGhost(look: MoveLook): void {
    const ghost = this.ghostOf(look.uid);
    if (!ghost) return;
    const end = look.path.at(-1)!;
    const before = look.path.at(-2)!;
    ghost.position.copy(this.board.groundOf(end));
    ghost.rotation.set(0, facingAngle(before, end), 0);
    ghost.visible = true;
  }

  /** El fantasma de esa unidad: una copia translucida de su modelo, hecha una vez por unidad elegida. */
  private ghostOf(uid: number): THREE.Object3D | null {
    if (this.ghost?.uid === uid) return this.ghost.object;
    this.hideGhost();
    const piece = this.board.pieceOf(uid);
    if (!piece) return null;
    const object = translucentCopy(piece.object);
    this.ghost = { uid, object };
    this.object.add(object);
    return object;
  }

  private hideGhost(): void {
    if (!this.ghost) return;
    this.object.remove(this.ghost.object);
    disposeMaterials(this.ghost.object);
    this.ghost = null;
  }
}

/** Un tramo de flecha de un punto a otro: una caja estirada entre los dos. */
function segmentMatrix(from: THREE.Vector3, to: THREE.Vector3): THREE.Matrix4 {
  const delta = to.clone().sub(from);
  const middle = from.clone().addScaledVector(delta, 0.5);
  const turn = new THREE.Quaternion().setFromUnitVectors(FORWARD, delta.clone().normalize());
  const size = new THREE.Vector3(ARROW_WIDTH, ARROW_THICKNESS, delta.length() + ARROW_WIDTH);
  return new THREE.Matrix4().compose(middle, turn, size);
}

/** Un triangulo plano que apunta hacia +z, con la base en el centro de la casilla. */
function arrowHeadGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-HEAD_WIDTH / 2, 0);
  shape.lineTo(HEAD_WIDTH / 2, 0);
  shape.lineTo(0, HEAD_LENGTH);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  // De pie en el plano xy a tumbado en el suelo, apuntando hacia +z.
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Una copia del modelo de la pieza, translucida, sin barra de vida y a su tamaño (aunque este apareciendo). */
function translucentCopy(model: THREE.Object3D): THREE.Object3D {
  const copy = model.clone(true);
  copy.scale.setScalar(1);
  copy.traverse((node) => {
    if (node instanceof THREE.Sprite) node.visible = false;
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh;
    const ghostly = materialsOf(mesh).map((material) => {
      const ghost = material.clone();
      ghost.transparent = true;
      ghost.opacity = GHOST_OPACITY;
      ghost.depthWrite = false;
      return ghost;
    });
    mesh.material = Array.isArray(mesh.material) ? ghostly : ghostly[0]!;
  });
  return copy;
}

function disposeMaterials(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of materialsOf(node as THREE.Mesh)) material.dispose();
  });
}

/** Los materiales de una malla (uno o varios), como lista. */
function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  const material: THREE.Material | THREE.Material[] = mesh.material;
  return Array.isArray(material) ? material : [material];
}
