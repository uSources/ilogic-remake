/**
 * Quien podria atacar a la unidad que se mira (ports/threat.ts, `showThreatLines`): una flecha roja
 * en arco desde cada enemigo hasta ella, por encima de las piezas, que late despacio. Solo dibuja lo
 * que se le dice (lo decide systems/threat/threatZone.ts). Las piezas de la flecha, en arrowParts.ts.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import type { ThreatLine } from '../../ports/threat';
import { arrowHeadGeometry, arrowMaterial, headMatrix, segmentGeometry, segmentMatrix, segmentsOf, type ArrowStyle } from './arrowParts';

/** Una flecha de bloques fina: se ve entre las piezas sin taparlas. */
const THREAT_ARROW: ArrowStyle = { lift: 0.55, width: 0.09, thickness: 0.06, headWidth: 0.34, headLength: 0.3 };
const LINE_COLOR = 0xff3b30;
const LINE_OPACITY = 0.9;
/** Lo que late (de la opacidad) y su ritmo: algo vivo que avisa, sin parpadear. */
const PULSE = 0.25;
const PULSE_SPEED = 3;
/** Lo que sube el arco: algo fijo y algo mas cuanto mas lejos esta el enemigo. */
const ARC_BASE = 0.35;
const ARC_PER_TILE = 0.12;
/** Tramos de cada arco. */
const ARC_STEPS = 12;
/** La punta se queda antes del centro de la unidad (para que se vea la unidad, no la punta). */
const STOP_SHORT = 0.42;
/** Nunca hay mas enemigos que esto que puedan atacar a una unidad a la vez. */
const MAX_LINES = 32;

export class ThreatLinesView {
  readonly object = new THREE.Group();
  private readonly material = arrowMaterial(LINE_COLOR, LINE_OPACITY);
  private readonly segments: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private time = 0;

  constructor(private readonly groundOf: (pos: Pos) => THREE.Vector3) {
    this.segments = instanced(segmentGeometry(), this.material, MAX_LINES * ARC_STEPS);
    this.heads = instanced(arrowHeadGeometry(THREAT_ARROW), this.material, MAX_LINES);
    this.object.add(this.segments, this.heads);
  }

  show(lines: readonly ThreatLine[]): void {
    const arcs = lines.slice(0, MAX_LINES).map((line) => this.arcOf(line));
    const segments = arcs.flatMap(segmentsOf);
    segments.forEach(([from, to], index) => this.segments.setMatrixAt(index, segmentMatrix(from, to, THREAT_ARROW)));
    setCount(this.segments, segments.length);
    arcs.forEach((points, index) => this.heads.setMatrixAt(index, headMatrix(points)));
    setCount(this.heads, arcs.length);
  }

  update(seconds: number): void {
    this.time += seconds;
    this.material.opacity = LINE_OPACITY - PULSE * (0.5 + 0.5 * Math.sin(this.time * PULSE_SPEED));
  }

  /** Los puntos del arco del enemigo a la unidad, acabando un poco antes de ella. */
  private arcOf({ from, to }: ThreatLine): THREE.Vector3[] {
    const lift = new THREE.Vector3(0, THREAT_ARROW.lift, 0);
    const start = this.groundOf(from).add(lift);
    const target = this.groundOf(to).add(lift);
    const flat = target.clone().sub(start).setY(0);
    const end = target.clone().addScaledVector(flat.clone().normalize(), -STOP_SHORT);
    const height = ARC_BASE + ARC_PER_TILE * flat.length();
    return Array.from({ length: ARC_STEPS + 1 }, (_, step) => {
      const t = step / ARC_STEPS;
      return start
        .clone()
        .lerp(end, t)
        .add(new THREE.Vector3(0, 4 * height * t * (1 - t), 0));
    });
  }
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function setCount(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
}
