/**
 * Las marcas sobre el tablero: a donde puede ir la unidad elegida, la casilla bajo el puntero y el
 * anillo de la unidad elegida. Solo dibujan lo que se les dice (no saben de reglas).
 */
import * as THREE from 'three';
import type { Pos } from '../core/model';

/** Lo justo por encima del suelo para no parpadear con el (z-fighting). */
const LIFT = 0.012;
const REACH_COLOR = 0x4fc3ff;
const REACH_OPACITY = 0.6;
const CURSOR_COLOR = 0xffd447;
/** Las marcas de alcance son algo menores que la casilla: se ve la cuadricula entre ellas. */
const REACH_INSET = 0.86;
/** Un mapa no tiene mas casillas que esto a la vez en el alcance (40 x 40). */
const MAX_REACH_TILES = 1600;
const RING_PULSE_SPEED = 4;

export class Highlights {
  readonly object = new THREE.Group();
  private readonly reach: THREE.InstancedMesh;
  private readonly cursor: THREE.LineSegments;
  private readonly ring: THREE.Mesh;
  private time = 0;

  constructor(private readonly groundOf: (pos: Pos) => THREE.Vector3) {
    this.reach = reachMesh();
    this.cursor = cursorMesh();
    this.ring = ringMesh();
    this.object.add(this.reach, this.cursor, this.ring);
  }

  showReach(tiles: readonly Pos[]): void {
    const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const size = new THREE.Vector3(REACH_INSET, REACH_INSET, 1);
    tiles.slice(0, MAX_REACH_TILES).forEach((pos, index) => {
      const at = this.groundOf(pos).add(new THREE.Vector3(0, LIFT, 0));
      this.reach.setMatrixAt(index, new THREE.Matrix4().compose(at, flat, size));
    });
    this.reach.count = Math.min(tiles.length, MAX_REACH_TILES);
    this.reach.instanceMatrix.needsUpdate = true;
  }

  hover(pos: Pos | null): void {
    this.cursor.visible = pos !== null;
    if (pos) this.cursor.position.copy(this.groundOf(pos)).add(new THREE.Vector3(0, LIFT * 2, 0));
  }

  select(pos: Pos | null): void {
    this.ring.visible = pos !== null;
    if (pos) this.ring.position.copy(this.groundOf(pos)).add(new THREE.Vector3(0, LIFT * 3, 0));
  }

  /** El anillo de la unidad elegida late (para encontrarla al girar la camara). */
  update(seconds: number): void {
    this.time += seconds;
    const pulse = 1 + Math.sin(this.time * RING_PULSE_SPEED) * 0.06;
    this.ring.scale.set(pulse, pulse, 1);
  }
}

function reachMesh(): THREE.InstancedMesh {
  const material = new THREE.MeshBasicMaterial({ color: REACH_COLOR, transparent: true, opacity: REACH_OPACITY, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, MAX_REACH_TILES);
  mesh.count = 0;
  // Su esfera de recorte se calcula una vez, con el alcance vacio: sin esto no se veria nunca.
  mesh.frustumCulled = false;
  return mesh;
}

/** El borde de la casilla bajo el puntero (un cuadrado de lineas). */
function cursorMesh(): THREE.LineSegments {
  const square = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.001, 1));
  const cursor = new THREE.LineSegments(square, new THREE.LineBasicMaterial({ color: CURSOR_COLOR }));
  cursor.visible = false;
  return cursor;
}

function ringMesh(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.48, 32),
    new THREE.MeshBasicMaterial({ color: CURSOR_COLOR, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
