/**
 * El mundo 3D: el lienzo de three.js, la escena con su luz cartoon y el bucle de dibujo. Quien anima
 * algo se apunta al bucle (`onFrame`) o pide una animacion que acaba (`animate`), en vez de llevar su
 * propio requestAnimationFrame.
 */
import * as THREE from 'three';

/**
 * La luz cartoon: un sol calido y fuerte, que pinta la cara iluminada, y un cielo frio y flojo, que
 * es lo unico que llega a la sombra. Asi la sombra no es gris sino azulada, como en un dibujo animado.
 */
const BACKGROUND_COLOR = 0xbfe6ff;
const SKY_FILL = 0x7f9cff;
const GROUND_FILL = 0x8a6fae;
const SKY_INTENSITY = 0.9;
const SUN_COLOR = 0xffe6b8;
const SUN_INTENSITY = 2.8;
/** De donde viene el sol (relativo al centro del mapa): alto y de lado, para que los bloques se lean. */
const SUN_DIRECTION = new THREE.Vector3(-0.6, 1, 0.45).normalize();
/** Resolucion del mapa de sombras: con la rampa de tres tonos no hace falta mas. */
const SHADOW_MAP_SIZE = 2048;

export type FrameListener = (seconds: number) => void;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  private readonly sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  private readonly listeners = new Set<FrameListener>();
  private readonly clock = new THREE.Clock();

  constructor(private readonly parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.addLights();
    this.scene.background = new THREE.Color(BACKGROUND_COLOR);
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(SKY_FILL, GROUND_FILL, SKY_INTENSITY));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
  }

  /** Coloca el sol para que su sombra cubra un mapa de ese centro y ese radio. */
  lightArea(center: THREE.Vector3, radius: number): void {
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(SUN_DIRECTION, radius * 2);
    const shadow = this.sun.shadow.camera;
    shadow.left = shadow.bottom = -radius;
    shadow.right = shadow.top = radius;
    shadow.far = radius * 4;
    shadow.updateProjectionMatrix();
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
      for (const listener of this.listeners) listener(delta);
      this.renderer.render(this.scene, this.camera);
    });
  }
}
