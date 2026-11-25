/**
 * La camara del fondo del menu, como logica (sin three.js): da vueltas despacio alrededor de un
 * punto del tablero, siempre igual, una vuelta entera cada `lapSeconds`. El punto no queda en el centro
 * de la pantalla sino donde no lo tapa el menu (a la derecha, o abajo en una pantalla alta): la camara
 * mira a otro punto, corrido al lado contrario de la pantalla, que gira con ella. Da la pose como
 * datos; el motor la aplica.
 */
import type { CameraPose, Point3 } from '../../ports/camera';

const FULL_TURN = 2 * Math.PI;
const degreesToRadians = (value: number): number => (value * Math.PI) / 180;

/**
 * Donde sale en la pantalla el punto alrededor del que se gira: la parte de media pantalla que se
 * corre a la derecha y hacia abajo (0, en el centro; 1, en el borde).
 */
export interface ScreenSpot {
  readonly right: number;
  readonly down: number;
}

export interface OrbitPath {
  /** El punto del suelo alrededor del que se gira. */
  readonly center: Readonly<Point3>;
  readonly distance: number;
  /** Inclinacion sobre el suelo (radianes). */
  readonly pitch: number;
  /** Lo que tarda en dar una vuelta entera. */
  readonly lapSeconds: number;
  /** El giro con el que empieza (radianes). */
  readonly startYaw: number;
  readonly spot: ScreenSpot;
}

/** Lo que ve la camara del motor: su apertura vertical (grados) y la forma de la pantalla (ancho / alto). */
export interface OrbitScreen {
  readonly verticalFov: number;
  readonly aspect: number;
}

/** Donde esta la camara tras `seconds` dando vueltas: lo mismo cada `lapSeconds`. */
export function orbitPose(path: OrbitPath, seconds: number, screen: OrbitScreen): CameraPose {
  const yaw = path.startYaw + FULL_TURN * ((seconds % path.lapSeconds) / path.lapSeconds);
  const halfHeight = path.distance * Math.tan(degreesToRadians(screen.verticalFov / 2));
  const rightShift = path.spot.right * halfHeight * screen.aspect;
  // Un paso por el suelo hacia el fondo se ve mas corto en la pantalla cuanto mas tumbada esta la camara.
  const downShift = (path.spot.down * halfHeight) / Math.sin(path.pitch);
  // La derecha de la pantalla y el fondo, en el suelo, con ese giro (ver engine/camera/cameraView.ts):
  // mirar a la izquierda y mas al fondo que el punto lo deja a la derecha y abajo.
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const target = {
    x: path.center.x - right.x * rightShift + forward.x * downShift,
    y: path.center.y,
    z: path.center.z - right.z * rightShift + forward.z * downShift,
  };
  return { target, distance: path.distance, yaw, pitch: path.pitch };
}
