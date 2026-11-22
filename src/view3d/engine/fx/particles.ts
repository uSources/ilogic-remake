/**
 * Particulas de un momento: humo y polvo, cuadradas como pixeles (PixelPoints), todas en una
 * sola llamada de dibujo. Cada clase de bocanada (PUFFS) dice sus colores, su tamaño, cuanto vive y
 * como se mueve; una nueva es una entrada mas. Quien las pide (`emit`) solo dice cual y donde; el
 * resto (moverlas, crecer, apagarse y reciclarlas) lo hace `update` en cada fotograma.
 */
import * as THREE from 'three';
import { reducedMotion } from '../../../ui/motion';
import { PixelPoints } from './pixelPoints';
import type { PuffKind } from '../../ports/stage';
import { WIND_DIRECTION } from '../core/space';
import { randomBetween } from '../core/random';

interface PuffSpec {
  colors: readonly number[];
  /** Tamaño al nacer y al morir (casillas). */
  size: readonly [number, number];
  /** Segundos que vive (entre estos dos). */
  life: readonly [number, number];
  /** Hacia arriba (casillas por segundo), cuanto se abre hacia los lados y cuanto lo lleva el viento. */
  rise: number;
  spread: number;
  drift: number;
  opacity: number;
}

const PUFFS: Readonly<Record<PuffKind, PuffSpec>> = {
  smoke: {
    colors: [0xd8dce6, 0xb8bec9, 0x9aa1ad],
    size: [0.08, 0.3],
    life: [1.6, 2.6],
    rise: 0.45,
    spread: 0.08,
    drift: 0.18,
    opacity: 0.75,
  },
  darkSmoke: {
    colors: [0x4a4e58, 0x3a3d45, 0x5c606a],
    size: [0.08, 0.28],
    life: [1.2, 2.2],
    rise: 0.5,
    spread: 0.1,
    drift: 0.15,
    opacity: 0.8,
  },
  dust: {
    colors: [0xd9b77a, 0xc9a464, 0xe6cc96],
    size: [0.05, 0.16],
    life: [0.5, 0.9],
    rise: 0.12,
    spread: 0.35,
    drift: 0.1,
    opacity: 0.7,
  },
  gunSmoke: { colors: [0xeef0f4, 0xd0d4dc], size: [0.05, 0.16], life: [0.4, 0.7], rise: 0.25, spread: 0.2, drift: 0.1, opacity: 0.7 },
};

/** Cada cuanto echa una bocanada una fuente que no para (una chimenea, una unidad herida), en segundos. */
const SOURCE_EVERY = 0.35;

/** Una fuente de humo que no para: su nombre (estable entre fotogramas), de donde sale y que humo. */
export interface PuffSource {
  key: string;
  at: THREE.Vector3;
  kind: PuffKind;
}

/** Cuantas puede haber a la vez: si se piden mas, las nuevas esperan a que se apague alguna. */
const MAX_PARTICLES = 900;

interface Particle {
  kind: PuffKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  color: THREE.Color;
}

const spreadOut = (amount: number): number => (Math.random() * 2 - 1) * amount;

export class ParticleSystem {
  private readonly points = new PixelPoints(MAX_PARTICLES);
  private readonly particles: Particle[] = [];
  /** Lo que lleva cada fuente desde su ultima bocanada. */
  private readonly sourceClocks = new Map<string, number>();

  get object(): THREE.Object3D {
    return this.points.object;
  }

  /** `count` bocanadas de esa clase en `at` (no salen con «reducir el movimiento»). */
  emit(kind: PuffKind, at: THREE.Vector3, count = 1): void {
    if (reducedMotion()) return;
    const spec = PUFFS[kind];
    for (let index = 0; index < count && this.particles.length < MAX_PARTICLES; index++) {
      const velocity = new THREE.Vector3(spreadOut(spec.spread), spec.rise * (0.6 + Math.random() * 0.8), spreadOut(spec.spread));
      velocity.addScaledVector(WIND_DIRECTION, spec.drift);
      const color = new THREE.Color(spec.colors[Math.floor(Math.random() * spec.colors.length)]);
      this.particles.push({ kind, position: at.clone(), velocity, age: 0, life: randomBetween(spec.life), color });
    }
  }

  /** Las fuentes que no paran echan su bocanada a su ritmo (las que ya no estan se olvidan). */
  keepEmitting(sources: readonly PuffSource[], seconds: number): void {
    const present = new Set(sources.map((source) => source.key));
    for (const key of this.sourceClocks.keys()) if (!present.has(key)) this.sourceClocks.delete(key);
    for (const source of sources) {
      // Empiezan a destiempo, para que no echen humo todas a la vez.
      const clock = (this.sourceClocks.get(source.key) ?? Math.random() * SOURCE_EVERY) + seconds;
      if (clock >= SOURCE_EVERY) this.emit(source.kind, source.at);
      this.sourceClocks.set(source.key, clock % SOURCE_EVERY);
    }
  }

  update(seconds: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.points.setScale(viewportHeight, camera);
    for (const particle of this.particles) {
      particle.age += seconds;
      particle.position.addScaledVector(particle.velocity, seconds);
      particle.velocity.multiplyScalar(1 - seconds * 1.5);
    }
    this.removeDead();
    this.draw();
  }

  private removeDead(): void {
    let kept = 0;
    for (const particle of this.particles) if (particle.age < particle.life) this.particles[kept++] = particle;
    this.particles.length = kept;
  }

  private draw(): void {
    const { points } = this;
    for (let index = 0; index < points.count; index++) {
      const particle = this.particles[index];
      if (!particle) {
        points.alphas[index] = 0;
        continue;
      }
      const spec = PUFFS[particle.kind];
      const progress = particle.age / particle.life;
      points.alphas[index] = spec.opacity * (progress < 0.15 ? progress / 0.15 : 1 - (progress - 0.15) / 0.85);
      points.sizes[index] = THREE.MathUtils.lerp(spec.size[0], spec.size[1], progress);
      points.positions.set([particle.position.x, particle.position.y, particle.position.z], index * 3);
      points.colors.set([particle.color.r, particle.color.g, particle.color.b], index * 3);
    }
    points.commit();
  }
}
