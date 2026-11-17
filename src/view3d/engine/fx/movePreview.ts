/**
 * A donde llegaria la unidad elegida (ports/turn.ts, `MovePreview`): una flecha de bloques por el suelo
 * a lo largo del camino, con su contorno de tinta, y al final un fantasma de la unidad (su modelo,
 * translucido) mirando hacia donde llega. Al apuntar de lejos, el visor del disparo en arco
 * (aimArc.ts). Solo dibuja lo que se le dice: el camino y el disparo los decide
 * systems/turn/movePreview.ts.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { MoveLook, MovePreview, ShotLook } from '../../ports/turn';
import { facingAngle } from '../core/space';
import type { UnitPiece } from '../pieces/unitPiece';
import { AimArc } from './aimArc';
import {
  arrowHeadGeometry,
  arrowMaterial,
  arrowPoints,
  BLOCK_ARROW,
  BLOCK_ARROW_INK,
  headMatrix,
  segmentGeometry,
  segmentMatrix,
  segmentsOf,
  type ArrowStyle,
} from './arrowParts';
import { INK_COLOR } from './markParts';

const ARROW_COLOR = 0xffd447;
/** Un camino no tiene mas pasos que esto (el movimiento mas largo cabe de sobra). */
const MAX_SEGMENTS = 64;
const GHOST_OPACITY = 0.45;
/** Altura (sobre el suelo) de la boca de donde sale el disparo y de donde llega. */
const MUZZLE_HEIGHT = 0.35;

/** Lo que necesita: el suelo de cada casilla y la pieza de cada unidad (para copiar su modelo). */
export interface MovePreviewBoard {
  groundOf(pos: Pos): THREE.Vector3;
  pieceOf(uid: number): UnitPiece | undefined;
}

/** Una capa de la flecha (la de tinta, debajo, o la amarilla): sus tramos y su punta. */
class ArrowLayer {
  readonly segments: THREE.InstancedMesh;
  readonly head: THREE.Mesh;

  constructor(
    readonly style: ArrowStyle,
    color: number,
    order: number,
  ) {
    const material = arrowMaterial(color, 1);
    this.segments = new THREE.InstancedMesh(segmentGeometry(), material, MAX_SEGMENTS);
    this.segments.frustumCulled = false;
    this.segments.count = 0;
    this.head = new THREE.Mesh(arrowHeadGeometry(style), material);
    this.segments.renderOrder = order;
    this.head.renderOrder = order;
  }

  draw(path: readonly Pos[] | null, groundOf: (pos: Pos) => THREE.Vector3): void {
    const isShown = !!path && path.length > 1;
    this.segments.visible = isShown;
    this.head.visible = isShown;
    if (!path || !isShown) return;
    const points = arrowPoints(path, groundOf, this.style);
    const steps = segmentsOf(points).slice(0, MAX_SEGMENTS);
    steps.forEach(([from, to], index) => this.segments.setMatrixAt(index, segmentMatrix(from, to, this.style)));
    this.segments.count = steps.length;
    this.segments.instanceMatrix.needsUpdate = true;
    headMatrix(points).decompose(this.head.position, this.head.quaternion, this.head.scale);
  }
}

export class MovePreviewView implements MovePreview {
  readonly object = new THREE.Group();
  private readonly layers = [new ArrowLayer(BLOCK_ARROW_INK, INK_COLOR, 30), new ArrowLayer(BLOCK_ARROW, ARROW_COLOR, 31)];
  private readonly arc = new AimArc();
  private ghost: { uid: number; object: THREE.Object3D } | null = null;

  constructor(private readonly board: MovePreviewBoard) {
    for (const layer of this.layers) this.object.add(layer.segments, layer.head);
    this.object.add(this.arc.object);
    this.show(null);
  }

  show(look: MoveLook | null): void {
    const groundOf = (pos: Pos) => this.board.groundOf(pos);
    for (const layer of this.layers) layer.draw(look?.path ?? null, groundOf);
    if (!look || look.path.length < 2) return this.hideGhost();
    this.placeGhost(look);
  }

  aim(shot: ShotLook | null): void {
    const muzzleOf = (pos: Pos) => this.board.groundOf(pos).add(new THREE.Vector3(0, MUZZLE_HEIGHT, 0));
    this.arc.show(shot ? muzzleOf(shot.from) : null, shot ? muzzleOf(shot.to) : null);
  }

  /** Un fotograma: el brillo del visor avanza. */
  update(seconds: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.arc.update(seconds, camera, viewportHeight);
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
