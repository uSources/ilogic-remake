/**
 * Lo que la camara de estrategia (systems/camera, logica sin three.js) pide al motor: ponerse donde
 * ella dice. Lo implementa engine/camera/cameraView.ts; los tests no lo necesitan (la logica da la
 * pose como datos).
 */

/** Un punto del mundo 3D (x, z: el suelo; y: la altura), sin depender del motor. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Donde esta la camara: mira a `target` desde `distance`, girada `yaw` alrededor y `pitch` sobre el suelo (radianes). */
export interface CameraPose {
  readonly target: Readonly<Point3>;
  readonly distance: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraView {
  /** Situa la camara del motor en esa pose. */
  place(pose: CameraPose): void;
  /** Apertura vertical de la camara (grados): cuanto suelo se ve a una distancia. */
  readonly verticalFov: number;
}
