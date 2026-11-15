/**
 * La camara de estrategia: mira desde arriba y en diagonal a un punto del suelo y se mueve con
 * suavidad hacia lo que se le pide. Desplazar (WASD, flechas o arrastrar), acercar (rueda), girar
 * alrededor del punto (boton derecho), como un tablero que se gira con la mano.
 */
import * as THREE from 'three';

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 40;
/** Inclinacion de partida: bastante desde arriba para leer el tablero, sin perder el volumen de los bloques. */
const START_PITCH = THREE.MathUtils.degToRad(52);
/** Ni a ras de suelo (se tapa todo con los bloques) ni del todo desde arriba (se pierde el volumen). */
const MIN_PITCH = THREE.MathUtils.degToRad(25);
const MAX_PITCH = THREE.MathUtils.degToRad(82);
/** Lo rapido que alcanza la camara a donde se le pide (mas, mas brusco). */
const FOLLOW_RATE = 10;
/** Casillas por segundo al desplazar con el teclado, a la distancia de partida. */
const KEY_PAN_SPEED = 12;
const WHEEL_ZOOM_STEP = 0.0015;

export interface CameraGoal {
  target: THREE.Vector3;
  distance: number;
  /** Giro alrededor del punto mirado (radianes). */
  yaw: number;
  /** Inclinacion sobre el suelo (radianes; si no, la de partida). */
  pitch?: number;
}

type CameraPose = Required<CameraGoal>;

export class CameraRig {
  private readonly goal: CameraPose;
  private readonly current: CameraPose;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    start: CameraGoal,
    private readonly bounds: THREE.Box2,
  ) {
    const pose = { pitch: START_PITCH, ...start };
    this.goal = { ...pose, target: start.target.clone() };
    this.current = { ...pose, target: start.target.clone() };
    this.place();
  }

  /** Desplaza el punto mirado en la pantalla (dx a la derecha, dy hacia el fondo), en casillas. */
  pan(right: number, forward: number): void {
    const forwardDir = new THREE.Vector3(-Math.sin(this.goal.yaw), 0, -Math.cos(this.goal.yaw));
    const rightDir = new THREE.Vector3(-forwardDir.z, 0, forwardDir.x);
    this.goal.target.addScaledVector(rightDir, right).addScaledVector(forwardDir, forward);
    this.goal.target.x = THREE.MathUtils.clamp(this.goal.target.x, this.bounds.min.x, this.bounds.max.x);
    this.goal.target.z = THREE.MathUtils.clamp(this.goal.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  /** Lleva la camara a mirar ese punto del suelo. */
  lookAt(target: THREE.Vector3): void {
    this.goal.target.copy(target);
  }

  /** Desplazar con el teclado: direccion de -1 a 1 en cada eje, durante `seconds`. */
  panByKeys(right: number, forward: number, seconds: number): void {
    const speed = KEY_PAN_SPEED * (this.goal.distance / MAX_DISTANCE + 0.4);
    this.pan(right * speed * seconds, forward * speed * seconds);
  }

  zoom(wheelDelta: number): void {
    this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (1 + wheelDelta * WHEEL_ZOOM_STEP), MIN_DISTANCE, MAX_DISTANCE);
  }

  /** Gira alrededor del punto mirado: `yaw` a los lados y `pitch` arriba o abajo (radianes). */
  orbit(yaw: number, pitch: number): void {
    this.goal.yaw += yaw;
    this.goal.pitch = THREE.MathUtils.clamp(this.goal.pitch + pitch, MIN_PITCH, MAX_PITCH);
  }

  /** Cuantas casillas del suelo ocupa un pixel de la pantalla (para arrastrar con el raton). */
  tilesPerPixel(viewportHeight: number): number {
    const visibleHeight = 2 * this.current.distance * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return visibleHeight / viewportHeight;
  }

  update(seconds: number): void {
    const blend = 1 - Math.exp(-FOLLOW_RATE * seconds);
    this.current.target.lerp(this.goal.target, blend);
    this.current.distance += (this.goal.distance - this.current.distance) * blend;
    this.current.yaw += (this.goal.yaw - this.current.yaw) * blend;
    this.current.pitch += (this.goal.pitch - this.current.pitch) * blend;
    this.place();
  }

  private place(): void {
    const { target, distance, yaw, pitch } = this.current;
    const ground = distance * Math.cos(pitch);
    const offset = new THREE.Vector3(Math.sin(yaw) * ground, distance * Math.sin(pitch), Math.cos(yaw) * ground);
    this.camera.position.copy(target).add(offset);
    this.camera.lookAt(target);
  }
}
