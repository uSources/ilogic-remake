/**
 * Sonido con sitio: un efecto que sale de un punto del tablero suena a la izquierda o a la derecha del
 * oyente y mas flojo lejos (`PannerNode`, sin binaural: con altavoces del portatil o del movil el HRTF
 * suena raro). Las distancias son en casillas, las mismas del mundo 3D. El oyente lo pone la vista con
 * la camara (`setListener`), cada fotograma.
 */
export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Donde esta el oyente y hacia donde mira (`forward` y `up`, de largo 1). */
export interface ListenerPose {
  readonly position: Point3;
  readonly forward: Point3;
  readonly up: Point3;
}

/** A esta distancia (casillas) suena a todo volumen; mas lejos, cada vez mas flojo hasta `MAX_DISTANCE`. */
const REFERENCE_DISTANCE = 6;
const MAX_DISTANCE = 40;
/** Lo rapido que baja el volumen con la distancia (modelo `inverse`: 1 es como en la realidad). */
const ROLLOFF = 0.8;

/** Un nodo que pone en `at` lo que pase por el. */
export function pannerAt(context: AudioContext, at: Point3): PannerNode {
  const panner = context.createPanner();
  panner.panningModel = 'equalpower';
  panner.distanceModel = 'inverse';
  panner.refDistance = REFERENCE_DISTANCE;
  panner.maxDistance = MAX_DISTANCE;
  panner.rolloffFactor = ROLLOFF;
  movePanner(panner, at);
  return panner;
}

function movePanner(panner: PannerNode, at: Point3): void {
  panner.positionX.value = at.x;
  panner.positionY.value = at.y;
  panner.positionZ.value = at.z;
}

/**
 * Mueve el oyente. Firefox (y Safari antiguo) no tienen `positionX` en el oyente, aunque los tipos digan
 * que si: alli, con `setPosition` y `setOrientation`, obsoletos pero lo unico que hay.
 */
export function setListener(context: AudioContext, pose: ListenerPose): void {
  const listener = context.listener;
  const { position, forward, up } = pose;
  if (!listener.positionX) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Firefox no tiene positionX en el oyente
    listener.setPosition(position.x, position.y, position.z);
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Firefox no tiene forwardX en el oyente
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    return;
  }
  listener.positionX.value = position.x;
  listener.positionY.value = position.y;
  listener.positionZ.value = position.z;
  listener.forwardX.value = forward.x;
  listener.forwardY.value = forward.y;
  listener.forwardZ.value = forward.z;
  listener.upX.value = up.x;
  listener.upY.value = up.y;
  listener.upZ.value = up.z;
}
