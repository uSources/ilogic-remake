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
import { arrowHeadGeometry, arrowMaterial, arrowPoints, headMatrix, segmentGeometry, segmentMatrix, segmentsOf } from './arrowParts';

const ARROW_COLOR = 0xffd447;
const ARROW_OPACITY = 0.9;
/** Un camino no tiene mas pasos que esto (el movimiento mas largo cabe de sobra). */
const MAX_SEGMENTS = 64;
const GHOST_OPACITY = 0.45;

/** Lo que necesita: el suelo de cada casilla y la pieza de cada unidad (para copiar su modelo). */
export interface MovePreviewBoard {
  groundOf(pos: Pos): THREE.Vector3;
  pieceOf(uid: number): UnitPiece | undefined;
}

export class MovePreviewView implements MovePreview {
  readonly object = new THREE.Group();
  private readonly segments: THREE.InstancedMesh;
  private readonly head: THREE.Mesh;
  private ghost: { uid: number; object: THREE.Object3D } | null = null;

  constructor(private readonly board: MovePreviewBoard) {
    const material = arrowMaterial(ARROW_COLOR, ARROW_OPACITY);
    this.segments = new THREE.InstancedMesh(segmentGeometry(), material, MAX_SEGMENTS);
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
    const points = arrowPoints(look.path, (pos) => this.board.groundOf(pos));
    this.drawSegments(points);
    this.drawHead(points);
    this.placeGhost(look);
  }

  private drawSegments(points: readonly THREE.Vector3[]): void {
    const steps = segmentsOf(points).slice(0, MAX_SEGMENTS);
    steps.forEach(([from, to], index) => this.segments.setMatrixAt(index, segmentMatrix(from, to)));
    this.segments.count = steps.length;
    this.segments.instanceMatrix.needsUpdate = true;
  }

  /** La punta, en la casilla de llegada, hacia donde se llega. */
  private drawHead(points: readonly THREE.Vector3[]): void {
    headMatrix(points).decompose(this.head.position, this.head.quaternion, this.head.scale);
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
