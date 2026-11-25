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
}

/** Lo que ve la camara del motor: su apertura vertical (grados) y la forma de la pantalla (ancho / alto). */
export interface OrbitScreen {
  readonly verticalFov: number;
  readonly aspect: number;
}

/** La pose que se mueve: en la vuelta solo cambian el giro y el punto al que se mira. */
interface OrbitPose extends CameraPose {
  readonly target: Point3;
  yaw: number;
}

export class OrbitCamera {
  private readonly current: OrbitPose;

  constructor(private readonly path: OrbitPath) {
    const { center, distance, pitch, startYaw } = path;
    this.current = { target: { x: center.x, y: center.y, z: center.z }, distance, yaw: startYaw, pitch };
  }

  /** Donde esta ahora (para el motor). Es siempre el mismo objeto: se mueve en cada fotograma sin crear nada. */
  get pose(): CameraPose {
    return this.current;
  }

  /** La lleva a donde esta tras `seconds` dando vueltas (lo mismo cada `lapSeconds`), con el punto en `spot`. */
  moveTo(seconds: number, screen: OrbitScreen, spot: ScreenSpot): void {
    const { path, current } = this;
    const yaw = path.startYaw + FULL_TURN * ((seconds % path.lapSeconds) / path.lapSeconds);
    const halfHeight = path.distance * Math.tan(degreesToRadians(screen.verticalFov / 2));
    const rightShift = spot.right * halfHeight * screen.aspect;
    // Un paso por el suelo hacia el fondo se ve mas corto en la pantalla cuanto mas tumbada esta la camara.
    const downShift = (spot.down * halfHeight) / Math.sin(path.pitch);
    // Con ese giro, la derecha de la pantalla en el suelo es (cos, -sin) y el fondo, (-sin, -cos) (ver
    // engine/camera/cameraView.ts): mirar a la izquierda y mas al fondo que el punto lo deja a la derecha y abajo.
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    current.yaw = yaw;
    current.target.x = path.center.x - cos * rightShift - sin * downShift;
    current.target.z = path.center.z + sin * rightShift - cos * downShift;
  }
}
