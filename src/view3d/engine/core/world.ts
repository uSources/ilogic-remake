/**
 * El mundo 3D: el lienzo de three.js, la escena con su luz cartoon y el bucle de dibujo. Quien anima
 * algo se apunta al bucle (`onFrame`) o pide una animacion que acaba (`animate`), en vez de llevar su
 * propio requestAnimationFrame.
 */
import * as THREE from 'three';
import type { FrameListener } from '../../ports/frame';
import { Sky, type SkyLook } from './sky';

/**
 * La luz cartoon: un sol calido y fuerte, que pinta la cara iluminada, y un cielo frio y flojo, que
 * es lo unico que llega a la sombra. Asi la sombra no es gris sino azulada, como en un dibujo animado.
 */
const SKY_FILL = 0x7f9cff;
const GROUND_FILL = 0x8a6fae;
const SKY_INTENSITY = 0.9;
const SUN_COLOR = 0xffe6b8;
const SUN_INTENSITY = 2.8;
/** De donde viene el sol (relativo al centro del mapa): alto y de lado, para que los bloques se lean. */
export const SUN_DIRECTION: Readonly<THREE.Vector3> = new THREE.Vector3(-0.6, 1, 0.45).normalize();
/** Resolucion del mapa de sombras: con la rampa de tres tonos no hace falta mas. */
const SHADOW_MAP_SIZE = 2048;

/** La luz de un clima: el sol (color y fuerza), el relleno del cielo y como se ve el cielo. */
interface Mood {
  sun: number;
  sunIntensity: number;
  sky: number;
  skyIntensity: number;
  look: SkyLook;
}

const CLEAR_MOOD: Mood = {
  sun: SUN_COLOR,
  sunIntensity: SUN_INTENSITY,
  sky: SKY_FILL,
  skyIntensity: SKY_INTENSITY,
  look: { horizon: 0xcdeeff, zenith: 0x5aa6f0, cloud: 0xffffff, sun: 1 },
};
/**
 * La luz de cada clima (id de weather.json); el que no esta, la de un dia despejado. Con lluvia y
 * tormenta el sol se apaga y enfria, el cielo se cubre de gris y las nubes se oscurecen; con nieve,
 * todo blanco y el sol tapado a medias; con la tormenta de arena, ocre.
 */
const WEATHER_MOODS: Readonly<Record<string, Mood>> = {
  Rain: {
    sun: 0xc8d6ec,
    sunIntensity: 1.7,
    sky: 0x8094c4,
    skyIntensity: 1.1,
    look: { horizon: 0xa9b8cc, zenith: 0x6f82a2, cloud: 0x9aa6b8, sun: 0 },
  },
  Snow: {
    sun: 0xf2f6ff,
    sunIntensity: 2.3,
    sky: 0xa4b8ec,
    skyIntensity: 1.2,
    look: { horizon: 0xe8f0f8, zenith: 0xaec4e0, cloud: 0xf4f8ff, sun: 0.4 },
  },
  Storm: {
    sun: 0xa8b4d0,
    sunIntensity: 1.2,
    sky: 0x60709e,
    skyIntensity: 1.0,
    look: { horizon: 0x6e7c94, zenith: 0x3c4660, cloud: 0x5c6478, sun: 0 },
  },
  Sandstorm: {
    sun: 0xffc98a,
    sunIntensity: 2.3,
    sky: 0xb0906e,
    skyIntensity: 1.0,
    look: { horizon: 0xe2c08e, zenith: 0xc89a62, cloud: 0xe8cfa4, sun: 0.5 },
  },
};
/** Lo que tarda (mas o menos, en segundos) en pasar la luz de un clima a la de otro. */
const MOOD_SECONDS = 1.5;
/** La niebla del fondo empieza pasado el mapa (nunca lo tapa) y a esta distancia mas ya es horizonte. */
const FOG_DEPTH = 110;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  private readonly sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  private readonly sky = new THREE.HemisphereLight(SKY_FILL, GROUND_FILL, SKY_INTENSITY);
  private readonly background = new THREE.Color(CLEAR_MOOD.look.horizon);
  private readonly fog = new THREE.Fog(CLEAR_MOOD.look.horizon);
  /** El cielo, alrededor del mapa: lo pone `lightArea`. */
  private dome: Sky | null = null;
  /** El mapa que se ve (para la niebla): su centro y su radio. */
  private readonly area = { center: new THREE.Vector3(), radius: 0 };
  private mood = CLEAR_MOOD;
  private readonly listeners = new Set<FrameListener>();
  private readonly clock = new THREE.Clock();

  constructor(private readonly parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.addLights();
    this.scene.background = this.background;
    this.scene.fog = this.fog;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private addLights(): void {
    this.scene.add(this.sky);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
  }

  /** La luz del clima de hoy (id de weather.json; null: despejado): se pasa a ella poco a poco. */
  setWeather(kind: string | null): void {
    this.mood = (kind && WEATHER_MOODS[kind]) || CLEAR_MOOD;
  }

  /** Acerca la luz a la del clima, un poco en cada fotograma. */
  private blendMood(seconds: number): void {
    const blend = Math.min(seconds / MOOD_SECONDS, 1);
    const { mood } = this;
    this.sun.color.lerp(new THREE.Color(mood.sun), blend);
    this.sun.intensity += (mood.sunIntensity - this.sun.intensity) * blend;
    this.sky.color.lerp(new THREE.Color(mood.sky), blend);
    this.sky.intensity += (mood.skyIntensity - this.sky.intensity) * blend;
    this.background.lerp(new THREE.Color(mood.look.horizon), blend);
    this.fog.color.copy(this.background);
    this.dome?.blendTo(mood.look, blend);
  }

  /** La niebla empieza donde acaba el mapa visto desde la camara: lo de fuera se funde con el horizonte. */
  private placeFog(): void {
    this.fog.near = this.camera.position.distanceTo(this.area.center) + this.area.radius;
    this.fog.far = this.fog.near + FOG_DEPTH;
  }

  /** Coloca el sol para que su sombra cubra un mapa de ese centro y ese radio, y el cielo y la niebla alrededor. */
  lightArea(center: THREE.Vector3, radius: number): void {
    this.area.center.copy(center);
    this.area.radius = radius;
    this.placeSky(center);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(SUN_DIRECTION, radius * 2);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -radius;
    shadow.right = shadow.top = radius;
    shadow.far = radius * 4;
    shadow.updateProjectionMatrix();
  }

  private placeSky(center: THREE.Vector3): void {
    if (this.dome) this.scene.remove(this.dome.object);
    this.dome = new Sky(center, SUN_DIRECTION.clone(), this.mood.look);
    this.scene.add(this.dome.object);
  }

  private fit(): void {
    const { clientWidth: width, clientHeight: height } = this.parent;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Llama a `listener` en cada fotograma con los segundos desde el anterior. Devuelve como dejar de llamarlo. */
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Una animacion de `seconds` segundos: `step` recibe de 0 a 1 en cada fotograma; acaba cuando llega a 1. */
  animate(seconds: number, step: (progress: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const stop = this.onFrame((delta) => {
        elapsed += delta;
        const progress = Math.min(elapsed / seconds, 1);
        step(progress);
        if (progress < 1) return;
        stop();
        resolve();
      });
    });
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const delta = Math.min(this.clock.getDelta(), 0.1);
      this.blendMood(delta);
      this.placeFog();
      this.dome?.update(delta, this.camera.position);
      for (const listener of this.listeners) listener(delta);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
