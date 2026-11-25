/**
 * Donde oye el jugador: en el punto al que mira la camara, un poco por encima, y mirando hacia donde
 * mira ella en horizontal. Asi lo que pasa a un lado de la pantalla suena a ese lado y lo que queda fuera
 * suena mas flojo. Si el oyente fuera la camara de verdad, al alejarla todo se apagaria; en vez de eso el
 * tablero baja un poco con `zoomLevel`, y el ambiente mucho mas (`ambienceZoomLevel`): el viento o el
 * agua se oyen con la camara baja, cerca del suelo. Lo de animales (pajaros, grillos, ranas, y lo que
 * dicen los animalitos), solo al acercarla (`animalZoomLevel`). Puro (datos de la camara, sin three.js
 * ni Web Audio).
 */
import type { ListenerPose } from '../../../audio/spatial';
import type { CameraPose } from '../../ports/camera';
import { MAX_DISTANCE, MIN_DISTANCE } from '../camera/strategyCamera';

/** Cuanto sube el oyente sobre el suelo (casillas), por cada casilla de distancia de la camara. */
const HEIGHT_PER_DISTANCE = 0.15;
/** Con la camara lo mas lejos posible, el tablero suena a esta parte de su volumen. */
const FAR_LEVEL = 0.6;
/** El ambiente suena entero con la camara pegada al suelo y baja hasta `AMBIENCE_FAR_LEVEL` a esta distancia (casillas). */
const AMBIENCE_FAR_DISTANCE = 28;
const AMBIENCE_FAR_LEVEL = 0.15;
/**
 * Lo de animales se oye entero con la camara pegada al suelo y nada desde esta distancia (casillas): por
 * debajo de la de empezar la partida (13), que desde ahi se oirian en todas partes y no al acercarse.
 */
const ANIMALS_FAR_DISTANCE = 11;

const UP = { x: 0, y: 1, z: 0 };

interface MovablePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * El oyente que sigue a la camara. Se mira cada fotograma, asi que no crea nada: cambia por dentro su
 * `pose` (siempre el mismo objeto) y solo cuando la camara se ha movido.
 */
export class CameraListener {
  private readonly position: MovablePoint = { x: 0, y: 0, z: 0 };
  private readonly forward: MovablePoint = { x: 0, y: 0, z: -1 };
  /** Hacia donde mira la camara; NaN al principio, para que la primera vez siempre cuente como movida. */
  private yaw = NaN;
  readonly pose: ListenerPose = { position: this.position, forward: this.forward, up: UP };

  /** Pone el oyente para la camara en `camera` (detras del objetivo segun `yaw`, cameraView.ts); true si se ha movido. */
  follow(camera: CameraPose): boolean {
    const { target, distance, yaw } = camera;
    const height = target.y + distance * HEIGHT_PER_DISTANCE;
    const { position, forward } = this;
    if (position.x === target.x && position.y === height && position.z === target.z && this.yaw === yaw) return false;
    position.x = target.x;
    position.y = height;
    position.z = target.z;
    this.yaw = yaw;
    forward.x = -Math.sin(yaw);
    forward.z = -Math.cos(yaw);
    return true;
  }
}

/** De 0 (camara a `near`) a 1 (a `far` o mas lejos). */
const farnessOf = (distance: number, near: number, far: number): number => Math.min(1, Math.max(0, (distance - near) / (far - near)));

/** Lo fuerte que suena el tablero con la camara a `distance`: 1 de cerca, `FAR_LEVEL` de lejos. */
export function zoomLevel(distance: number): number {
  return 1 - farnessOf(distance, MIN_DISTANCE, MAX_DISTANCE) * (1 - FAR_LEVEL);
}

/** Lo fuerte que suena el ambiente (no el clima) con la camara a `distance`: 1 pegada al suelo, casi nada desde arriba. */
export function ambienceZoomLevel(distance: number): number {
  return 1 - farnessOf(distance, MIN_DISTANCE, AMBIENCE_FAR_DISTANCE) * (1 - AMBIENCE_FAR_LEVEL);
}

/**
 * Lo que se oye a los animales (sus ambientes y lo que dicen) con la camara a `distance`: 1 pegada al
 * suelo, nada desde `ANIMALS_FAR_DISTANCE`.
 */
export function animalZoomLevel(distance: number): number {
  return 1 - farnessOf(distance, MIN_DISTANCE, ANIMALS_FAR_DISTANCE);
}
