/**
 * Donde oye el jugador: en el punto al que mira la camara, un poco por encima, y mirando hacia donde
 * mira ella en horizontal. Asi lo que pasa a un lado de la pantalla suena a ese lado y lo que queda fuera
 * suena mas flojo. Si el oyente fuera la camara de verdad, al alejarla todo se apagaria; en vez de eso el
 * tablero baja un poco con `zoomLevel`. Puro (datos de la camara, sin three.js ni Web Audio).
 */
import type { ListenerPose } from '../../../audio/spatial';
import type { CameraPose } from '../../ports/camera';
import { MAX_DISTANCE, MIN_DISTANCE } from '../camera/strategyCamera';

/** Cuanto sube el oyente sobre el suelo (casillas), por cada casilla de distancia de la camara. */
const HEIGHT_PER_DISTANCE = 0.15;
/** Con la camara lo mas lejos posible, el tablero suena a esta parte de su volumen. */
const FAR_LEVEL = 0.6;

const UP = { x: 0, y: 1, z: 0 };

/** El oyente para la camara en `pose`. La camara esta detras del objetivo segun `yaw` (cameraView.ts). */
export function listenerOf(pose: CameraPose): ListenerPose {
  const { target, distance, yaw } = pose;
  return {
    position: { x: target.x, y: target.y + distance * HEIGHT_PER_DISTANCE, z: target.z },
    forward: { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) },
    up: UP,
  };
}

/** Lo fuerte que suena el tablero con la camara a `distance`: 1 de cerca, `FAR_LEVEL` de lejos. */
export function zoomLevel(distance: number): number {
  const farness = Math.min(1, Math.max(0, (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE)));
  return 1 - farness * (1 - FAR_LEVEL);
}
