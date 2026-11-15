/**
 * Las marcas que dejan las unidades en el suelo al moverse: dos rodadas detras de los vehiculos y
 * pisadas, una de cada pie, detras de la infanteria (los aviones no dejan nada). Son manchas oscuras
 * a ras de suelo en una malla instanciada que se va reciclando (las mas viejas dejan sitio a las
 * nuevas) y que se encogen hasta borrarse al cabo de un rato.
 */
import * as THREE from 'three';
import type { MovementMotion } from '../core/content';

/** Como deja huella cada forma de moverse (movements.json, "motion"): de cada lado, ancho y largo (casillas). */
const MARK_SHAPES: Readonly<Partial<Record<MovementMotion, { offset: number; width: number; length: number }>>> = {
  // Las rodadas miden medio paso: como se deja una cada medio paso, salen seguidas.
  drive: { offset: 0.25, width: 0.14, length: 0.52 },
  march: { offset: 0.1, width: 0.09, length: 0.13 },
};

const MAX_MARKS = 600;
const MARK_SECONDS = 14;
/** Lo que tarda en borrarse al final de su vida. */
const FADE_SECONDS = 4;
/** Lo justo por encima del suelo para no parpadear con el. */
const LIFT = 0.008;
const MARK_COLOR = 0x3a2a1a;
const MARK_OPACITY = 0.45;

interface Mark {
  at: THREE.Vector3;
  heading: number;
  width: number;
  length: number;
  age: number;
}

export class GroundMarks {
  readonly mesh: THREE.InstancedMesh;
  private readonly marks: (Mark | null)[] = Array.from({ length: MAX_MARKS }, () => null);
  private next = 0;
  /** Para las pisadas: el pie que toca (izquierdo o derecho, uno y otro). */
  private stride = 1;

  constructor() {
    const material = new THREE.MeshBasicMaterial({ color: MARK_COLOR, transparent: true, opacity: MARK_OPACITY, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, MAX_MARKS);
    this.mesh.count = MAX_MARKS;
    this.mesh.frustumCulled = false;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let index = 0; index < MAX_MARKS; index++) this.mesh.setMatrixAt(index, hidden);
  }

  /** La huella de quien se mueve asi en `at` (el suelo), mirando hacia `heading` (radianes, como las piezas). */
  leave(at: THREE.Vector3, heading: number, motion: MovementMotion): void {
    const shape = MARK_SHAPES[motion];
    if (!shape) return;
    const across = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
    const sides = motion === 'march' ? [(this.stride = -this.stride)] : [-1, 1];
    for (const side of sides)
      this.add({ at: at.clone().addScaledVector(across, side * shape.offset), heading, width: shape.width, length: shape.length, age: 0 });
  }

  private add(mark: Mark): void {
    this.marks[this.next] = mark;
    this.next = (this.next + 1) % MAX_MARKS;
  }

  update(seconds: number): void {
    this.marks.forEach((mark, index) => {
      if (!mark) return;
      mark.age += seconds;
      if (mark.age >= MARK_SECONDS) this.marks[index] = null;
      this.mesh.setMatrixAt(index, placeOf(mark));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Donde va una marca y su tamaño (al final de su vida, encogiendose; borrada, de tamaño 0). */
function placeOf(mark: Mark): THREE.Matrix4 {
  const left = MARK_SECONDS - mark.age;
  const scale = left <= 0 ? 0 : Math.min(1, left / FADE_SECONDS);
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), mark.heading);
  const at = mark.at.clone().add(new THREE.Vector3(0, LIFT, 0));
  return new THREE.Matrix4().compose(at, turn, new THREE.Vector3(mark.width * scale, 1, mark.length * scale));
}
