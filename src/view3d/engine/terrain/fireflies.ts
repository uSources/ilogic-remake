/**
 * Las luciernagas del pantano: puntitos de luz amarilla verdosa que revolotean despacio sobre los
 * arboles, los juncos y el agua cerca de la camara, y se encienden y se apagan cada una a su ritmo.
 * Cada una es un nucleo brillante con un halo suave alrededor, y suman su luz a lo de detras: asi
 * brillan tambien de dia. Es ambiente, como el polvo de la arena (sandDust.ts): con «reducir el
 * movimiento» no salen.
 */
import * as THREE from 'three';
import type { Pos } from '../../../core/model';
import { reducedMotion } from '../../../ui/motion';
import { PixelPoints } from '../fx/pixelPoints';
import { randomBetween } from '../core/random';

const FIREFLIES = 48;
const CORE_COLOR = 0xf6ffa8;
const CORE_SIZE = 0.035;
const HALO_COLOR = 0xc8ff50;
const HALO_SIZE = 0.16;
const HALO_OPACITY = 0.55;
/** A que altura sobre su casilla revolotean (casillas). */
const HEIGHT = [0.2, 0.7] as const;
/** Lo que se alejan de su sitio al revolotear (casillas). */
const DRIFT = 0.3;
/** Lo que vive cada una y lo que tarda en encenderse y apagarse una vez (segundos). */
const LIFE_SECONDS = [7, 15] as const;
const BLINK_SECONDS = [1.6, 3.2] as const;
/** Lo deprisa que revolotean (radianes por segundo de su vaiven). */
const WANDER_SPEED = [0.3, 0.7] as const;
/** Las que nacen por segundo como mucho: al empezar no se encienden todas a la vez. */
const BIRTHS_PER_SECOND = 5;

interface Firefly {
  home: THREE.Vector3;
  age: number;
  life: number;
  blink: number;
  speed: number;
  /** Un desfase propio para que no vayan a la par. */
  phase: number;
}

/** Cuanto de cada parpadeo esta encendida (algo mas de la mitad) y lo deprisa que se enciende y se apaga. */
const BLINK_ON = 0.2;
const BLINK_EDGE = 1.6;

/** Lo que brilla en cada momento: se enciende y se apaga a pulsos, y entra y sale despacio de su vida. */
function brightness(firefly: Firefly): number {
  const wave = Math.sin((firefly.age / firefly.blink) * Math.PI * 2 + firefly.phase);
  const pulse = THREE.MathUtils.clamp((wave + BLINK_ON) * BLINK_EDGE, 0, 1);
  return pulse * Math.sin((firefly.age / firefly.life) * Math.PI);
}

export class Fireflies {
  readonly object = new THREE.Group();
  private readonly halo = new PixelPoints(FIREFLIES);
  private readonly core = new PixelPoints(FIREFLIES);
  private readonly fireflies: (Firefly | null)[] = Array.from({ length: FIREFLIES }, () => null);
  /** Las que pueden nacer ya (se van sumando con el tiempo). */
  private births = 0;
  private readonly at = new THREE.Vector3();
  /** Las casillas cerca de lo que se mira y alrededor de donde (casilla y radio redondeados) se buscaron. */
  private nearby: readonly Pos[] = [];
  private readonly nearbyAround = { x: Number.NaN, z: Number.NaN, radius: Number.NaN };

  constructor(
    private readonly tiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
  ) {
    this.halo.setLook(HALO_COLOR, HALO_OPACITY);
    this.core.setLook(CORE_COLOR, 1);
    this.halo.glow();
    this.core.glow();
    this.object.add(this.halo.object, this.core.object);
  }

  /** Avanza las luciernagas cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.object.visible = this.tiles.length > 0 && !reducedMotion();
    if (!this.object.visible) return;
    this.halo.setScale(viewportHeight, camera);
    this.core.setScale(viewportHeight, camera);
    this.births = Math.min(this.births + seconds * BIRTHS_PER_SECOND, FIREFLIES);
    const nearby = this.tilesNear(center, radius);
    this.fireflies.forEach((firefly, index) => (this.fireflies[index] = this.step(firefly, seconds, nearby)));
    this.draw();
  }

  /** Las casillas con luciernagas cerca de lo que se mira: se buscan otra vez solo si la camara cambia de casilla o de distancia. */
  private tilesNear(center: THREE.Vector3, radius: number): readonly Pos[] {
    const around = this.nearbyAround;
    const x = Math.round(center.x);
    const z = Math.round(center.z);
    const reach = Math.round(radius);
    if (x === around.x && z === around.z && reach === around.radius) return this.nearby;
    Object.assign(around, { x, z, radius: reach });
    this.nearby = this.tiles.filter((pos) => Math.abs(pos.x - x) < reach && Math.abs(pos.y - z) < reach);
    return this.nearby;
  }

  private step(firefly: Firefly | null, seconds: number, nearby: readonly Pos[]): Firefly | null {
    if (!firefly) return this.births >= 1 && nearby.length ? this.born(nearby) : null;
    firefly.age += seconds;
    return firefly.age < firefly.life ? firefly : null;
  }

  private born(nearby: readonly Pos[]): Firefly {
    this.births -= 1;
    const tile = nearby[Math.floor(Math.random() * nearby.length)]!;
    const home = this.groundOf(tile).add(new THREE.Vector3(Math.random() - 0.5, randomBetween(HEIGHT), Math.random() - 0.5));
    return {
      home,
      age: 0,
      life: randomBetween(LIFE_SECONDS),
      blink: randomBetween(BLINK_SECONDS),
      speed: randomBetween(WANDER_SPEED),
      phase: Math.random() * Math.PI * 2,
    };
  }

  /** Donde esta ahora: vuela en lazos lentos alrededor de su sitio, subiendo y bajando un poco. */
  private positionOf(firefly: Firefly): THREE.Vector3 {
    const turn = firefly.age * firefly.speed + firefly.phase;
    return this.at.set(Math.sin(turn) * DRIFT, Math.sin(turn * 1.9) * 0.06, Math.sin(turn * 0.7 + firefly.phase) * DRIFT).add(firefly.home);
  }

  private draw(): void {
    this.fireflies.forEach((firefly, index) => {
      const at = firefly ? this.positionOf(firefly) : null;
      const glow = firefly ? brightness(firefly) : 0;
      setPoint(this.halo, index, at, HALO_SIZE, glow);
      setPoint(this.core, index, at, CORE_SIZE, glow);
    });
    this.halo.commit();
    this.core.commit();
  }
}

/** Pone el punto `index`: donde, cuanto mide y cuanto brilla (sin sitio, no se ve). */
function setPoint(points: PixelPoints, index: number, at: THREE.Vector3 | null, size: number, glow: number): void {
  points.alphas[index] = at ? glow : 0;
  points.sizes[index] = at ? size : 0;
  if (!at) return;
  points.positions[index * 3] = at.x;
  points.positions[index * 3 + 1] = at.y;
  points.positions[index * 3 + 2] = at.z;
}
