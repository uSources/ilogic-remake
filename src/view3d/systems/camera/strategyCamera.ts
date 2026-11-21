/**
 * La camara de estrategia como logica (sin three.js): mira desde arriba y en diagonal a un punto del
 * suelo y se mueve con suavidad hacia lo que se le pide. Desplazar (WASD, flechas o arrastrar),
 * acercar (rueda), girar alrededor del punto (boton derecho), como un tablero que se gira con la mano.
 * Da su pose como datos (`pose`); el motor la aplica a su camara (engine/camera/cameraView.ts).
 */
import type { CameraPose, Point3 } from '../../ports/camera';

export const MIN_DISTANCE = 6;
export const MAX_DISTANCE = 40;
const degrees = (value: number): number => (value * Math.PI) / 180;
/** Inclinacion de partida: bastante desde arriba para leer el tablero, sin perder el volumen de los bloques. */
const START_PITCH = degrees(52);
/**
 * Ni del todo desde arriba (se pierde el volumen) ni a ras de suelo (se tapa todo con los bloques).
 * Lo mas bajo deja ver el horizonte y el cielo por encima del mar.
 */
const MIN_PITCH = degrees(12);
const MAX_PITCH = degrees(82);
/** Lo rapido que alcanza la camara a donde se le pide (mas, mas brusco). */
const FOLLOW_RATE = 10;
/** Casillas por segundo al desplazar con el teclado, a la distancia de partida. */
const KEY_PAN_SPEED = 12;
/** Lo que se sigue desplazando con el teclado aun de muy cerca (si no, de cerca casi no se moveria). */
const KEY_PAN_FLOOR = 0.4;
const WHEEL_ZOOM_STEP = 0.0015;

export interface CameraStart {
  target: Readonly<Point3>;
  distance: number;
  /** Giro alrededor del punto mirado (radianes). */
  yaw: number;
  /** Inclinacion sobre el suelo (radianes; si no, la de partida). */
  pitch?: number;
}

/** Hasta donde puede ir el punto mirado en el suelo (x, z del mundo). */
export interface GroundBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Lo que la entrada (teclado, puntero) pide a la camara. */
export interface CameraControls {
  /** Desplaza el punto mirado en la pantalla (a la derecha, hacia el fondo), en casillas. */
  pan(right: number, forward: number): void;
  /** Desplazar con el teclado: direccion de -1 a 1 en cada eje, durante `seconds`. */
  panByKeys(right: number, forward: number, seconds: number): void;
  zoom(wheelDelta: number): void;
  /** Gira alrededor del punto mirado: `yaw` a los lados y `pitch` arriba o abajo (radianes). */
  orbit(yaw: number, pitch: number): void;
  /** Cuantas casillas del suelo ocupa un pixel de la pantalla (para arrastrar con el raton). */
  tilesPerPixel(viewportHeight: number): number;
}

interface MutablePose {
  target: Point3;
  distance: number;
  yaw: number;
  pitch: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const towards = (from: number, to: number, share: number): number => from + (to - from) * share;
const copyPoint = (point: Readonly<Point3>): Point3 => ({ x: point.x, y: point.y, z: point.z });

export class StrategyCamera implements CameraControls {
  /** A donde va. */
  private readonly goal: MutablePose;
  /** Donde esta (alcanza `goal` poco a poco). */
  private readonly current: MutablePose;

  constructor(
    start: CameraStart,
    private readonly bounds: GroundBounds,
    /** Apertura vertical de la camara (grados), para saber cuanto suelo se ve. */
    private readonly verticalFov: number,
  ) {
    const pose = { pitch: START_PITCH, ...start };
    this.goal = { ...pose, target: copyPoint(start.target) };
    this.current = { ...pose, target: copyPoint(start.target) };
  }

  /** Donde esta ahora (para el motor y lo que se dibuja solo cerca: el clima). */
  get pose(): CameraPose {
    return this.current;
  }

  pan(right: number, forward: number): void {
    const forwardX = -Math.sin(this.goal.yaw);
    const forwardZ = -Math.cos(this.goal.yaw);
    // La derecha de la pantalla es el fondo girado un cuarto de vuelta.
    const target = this.goal.target;
    target.x = clamp(target.x - forwardZ * right + forwardX * forward, this.bounds.minX, this.bounds.maxX);
    target.z = clamp(target.z + forwardX * right + forwardZ * forward, this.bounds.minZ, this.bounds.maxZ);
  }

  /** Lleva la camara a mirar ese punto del suelo. */
  lookAt(target: Readonly<Point3>): void {
    Object.assign(this.goal.target, copyPoint(target));
  }

  panByKeys(right: number, forward: number, seconds: number): void {
    const speed = KEY_PAN_SPEED * (this.goal.distance / MAX_DISTANCE + KEY_PAN_FLOOR);
    this.pan(right * speed * seconds, forward * speed * seconds);
  }

  zoom(wheelDelta: number): void {
    this.goal.distance = clamp(this.goal.distance * (1 + wheelDelta * WHEEL_ZOOM_STEP), MIN_DISTANCE, MAX_DISTANCE);
  }

  orbit(yaw: number, pitch: number): void {
    this.goal.yaw += yaw;
    this.goal.pitch = clamp(this.goal.pitch + pitch, MIN_PITCH, MAX_PITCH);
  }

  tilesPerPixel(viewportHeight: number): number {
    const visibleHeight = 2 * this.current.distance * Math.tan(degrees(this.verticalFov / 2));
    return visibleHeight / viewportHeight;
  }

  /** Un fotograma mas acercandose a donde se le ha pedido (igual de suave con cualquier ritmo de fotogramas). */
  update(seconds: number): void {
    const share = 1 - Math.exp(-FOLLOW_RATE * seconds);
    const { current, goal } = this;
    current.target.x = towards(current.target.x, goal.target.x, share);
    current.target.y = towards(current.target.y, goal.target.y, share);
    current.target.z = towards(current.target.z, goal.target.z, share);
    current.distance = towards(current.distance, goal.distance, share);
    current.yaw = towards(current.yaw, goal.yaw, share);
    current.pitch = towards(current.pitch, goal.pitch, share);
  }
}
