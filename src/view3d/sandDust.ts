/**
 * El polvo que levanta el viento en la arena, haga el tiempo que haga: rafagas que van y vienen, y en
 * cada una unos granos claros que salen de casillas de arena cerca de la camara, cruzan bajos con el
 * viento y se apagan. Poco y de vez en cuando: es ambiente, no clima (la tormenta de arena es otra
 * cosa: weather3d.ts). Con «reducir el movimiento» no sale.
 */
import * as THREE from 'three';
import type { Pos } from '../core/model';
import { reducedMotion } from '../ui/motion';
import { PixelPoints } from './pixelPoints';
import { WIND_DIRECTION } from './space';

const GRAINS = 90;
const GRAIN_COLOR = 0xffe4a8;
const GRAIN_OPACITY = 0.85;
/** Casillas por segundo con el viento (el mismo que el del clima). */
const WIND = WIND_DIRECTION.clone().multiplyScalar(1.4);
const LIFE_SECONDS = [1.2, 2.6] as const;
/** Las rafagas: cada cuanto vuelven (segundos) y que parte del tiempo sopla. */
const GUST_PERIOD = 7;
const GUST_SHARE = 0.45;

interface Grain {
  position: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  /** Un vaiven propio para que no vayan todos en fila. */
  phase: number;
}

const between = ([low, high]: readonly [number, number]): number => low + Math.random() * (high - low);

export class SandDust {
  private readonly points = new PixelPoints(GRAINS);
  private readonly grains: (Grain | null)[] = Array.from({ length: GRAINS }, () => null);
  private time = 0;

  constructor(
    private readonly sandTiles: readonly Pos[],
    private readonly groundOf: (pos: Pos) => THREE.Vector3,
  ) {
    this.points.setLook(GRAIN_COLOR, GRAIN_OPACITY);
  }

  get object(): THREE.Object3D {
    return this.points.object;
  }

  /** Avanza el polvo cerca de `center` (lo que mira la camara), en un radio `radius`. */
  update(seconds: number, center: THREE.Vector3, radius: number, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
    this.time += seconds;
    this.points.object.visible = this.sandTiles.length > 0 && !reducedMotion();
    if (!this.points.object.visible) return;
    this.points.setScale(viewportHeight, camera);
    const nearby = this.sandTiles.filter((pos) => Math.abs(pos.x - center.x) < radius && Math.abs(pos.y - center.z) < radius);
    this.grains.forEach((grain, index) => (this.grains[index] = this.stepGrain(grain, seconds, nearby)));
    this.draw();
  }

  /** Sopla en rafagas: la mitad del tiempo, mas o menos, con una entrada y una salida suaves. */
  private isGusting(): boolean {
    return Math.sin((this.time / GUST_PERIOD) * Math.PI * 2) > 1 - GUST_SHARE * 2;
  }

  private stepGrain(grain: Grain | null, seconds: number, nearby: readonly Pos[]): Grain | null {
    if (!grain) return this.isGusting() && nearby.length ? this.newGrain(nearby) : null;
    grain.age += seconds;
    if (grain.age >= grain.life) return null;
    grain.position.addScaledVector(WIND, seconds);
    grain.position.y += Math.sin(grain.age * 5 + grain.phase) * 0.15 * seconds;
    return grain;
  }

  private newGrain(nearby: readonly Pos[]): Grain {
    const tile = nearby[Math.floor(Math.random() * nearby.length)]!;
    const position = this.groundOf(tile).add(new THREE.Vector3(Math.random() - 0.5, 0.05 + Math.random() * 0.25, Math.random() - 0.5));
    return { position, age: 0, life: between(LIFE_SECONDS), size: 0.04 + Math.random() * 0.04, phase: Math.random() * Math.PI * 2 };
  }

  private draw(): void {
    this.grains.forEach((grain, index) => {
      // Aparece y se apaga despacio (nada de pixeles que salen de la nada).
      this.points.alphas[index] = grain ? Math.sin((grain.age / grain.life) * Math.PI) : 0;
      this.points.sizes[index] = grain?.size ?? 0;
      if (grain) this.points.positions.set([grain.position.x, grain.position.y, grain.position.z], index * 3);
    });
    this.points.commit();
  }
}
