/**
 * Lo que haran las ordenes al terminar el turno (ports/orders.ts, `IntentMarks`): una flecha clara con
 * el camino de cada unidad, un marco rojo sobre la que va a atacar y uno dorado sobre el edificio que
 * va a capturar. Solo dibuja lo que se le dice (lo decide systems/orders/orderIntents.ts).
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { IntentLook, IntentMarks } from '../../ports/orders';
import { arrowHeadGeometry, arrowMaterial, arrowPoints, headMatrix, segmentGeometry, segmentMatrix, segmentsOf } from './arrowParts';

/** Clara: no se confunde con la flecha del camino que se esta trazando (amarilla). */
const INTENT_COLOR = 0xe8f1ff;
const INTENT_OPACITY = 0.7;
const ATTACK_COLOR = 0xff4d45;
const CAPTURE_COLOR = 0xffd447;
/** Lo justo por encima del suelo para no parpadear con el, y algo menor que la casilla. */
const FRAME_LIFT = 0.03;
const FRAME_SIZE = 0.92;
const MAX_SEGMENTS = 512;
const MAX_ARROWS = 128;

export class IntentArrowsView implements IntentMarks {
  readonly object = new THREE.Group();
  private readonly segments: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly frames = new THREE.Group();

  constructor(private readonly groundOf: (pos: Pos) => THREE.Vector3) {
    const material = arrowMaterial(INTENT_COLOR, INTENT_OPACITY);
    this.segments = instanced(segmentGeometry(), material, MAX_SEGMENTS);
    this.heads = instanced(arrowHeadGeometry(), material, MAX_ARROWS);
    this.object.add(this.segments, this.heads, this.frames);
  }

  show(intents: readonly IntentLook[]): void {
    const paths = intents.filter((intent) => intent.path.length > 1).map((intent) => arrowPoints(intent.path, this.groundOf));
    const segments = paths.flatMap(segmentsOf).slice(0, MAX_SEGMENTS);
    segments.forEach(([from, to], index) => this.segments.setMatrixAt(index, segmentMatrix(from, to)));
    setCount(this.segments, segments.length);
    const heads = paths.slice(0, MAX_ARROWS);
    heads.forEach((points, index) => this.heads.setMatrixAt(index, headMatrix(points)));
    setCount(this.heads, heads.length);
    this.drawFrames(intents);
  }

  /** Un marco por objetivo: rojo el que se ataca, dorado lo que se captura. Son pocos: se rehacen. */
  private drawFrames(intents: readonly IntentLook[]): void {
    for (const frame of [...this.frames.children]) this.frames.remove(frame);
    for (const intent of intents) {
      if (intent.attack) this.frames.add(this.frameAt(intent.attack, ATTACK_COLOR));
      if (intent.capture) this.frames.add(this.frameAt(intent.capture, CAPTURE_COLOR));
    }
  }

  private frameAt(pos: Pos, color: number): THREE.LineSegments {
    const frame = new THREE.LineSegments(FRAME_GEOMETRY, frameMaterial(color));
    frame.position.copy(this.groundOf(pos)).add(new THREE.Vector3(0, FRAME_LIFT, 0));
    return frame;
  }
}

const FRAME_GEOMETRY = new THREE.EdgesGeometry(new THREE.BoxGeometry(FRAME_SIZE, 0.001, FRAME_SIZE));
const frameMaterials = new Map<number, THREE.LineBasicMaterial>();

function frameMaterial(color: number): THREE.LineBasicMaterial {
  let material = frameMaterials.get(color);
  if (!material) {
    material = new THREE.LineBasicMaterial({ color });
    frameMaterials.set(color, material);
  }
  return material;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, max: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.count = 0;
  // Su esfera de recorte se calcula una vez, vacia: sin esto no se veria nunca.
  mesh.frustumCulled = false;
  return mesh;
}

function setCount(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}
