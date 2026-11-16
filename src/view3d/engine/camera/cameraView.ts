/**
 * Pone la camara de three.js donde dice la camara de estrategia (systems/camera): no decide nada,
 * solo convierte la pose (punto mirado, distancia, giro, inclinacion) en posicion y orientacion.
 */
import * as THREE from 'three';
import type { CameraPose, CameraView } from '../../ports/camera';

export class ThreeCameraView implements CameraView {
  /** El punto del suelo que se mira ahora (el mismo objeto siempre: lo leen el clima y el polvo en cada fotograma). */
  readonly target = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  get verticalFov(): number {
    return this.camera.fov;
  }

  place({ target, distance, yaw, pitch }: CameraPose): void {
    const ground = distance * Math.cos(pitch);
    this.target.set(target.x, target.y, target.z);
    this.offset.set(Math.sin(yaw) * ground, distance * Math.sin(pitch), Math.cos(yaw) * ground);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
