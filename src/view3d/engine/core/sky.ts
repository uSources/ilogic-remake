/**
 * El cielo de juguete: una cupula con un degradado en bandas secas (del horizonte claro al cenit mas
 * azul; sin degradado suave, como la rampa de dos tonos de las piezas), un sol cuadrado de pixel y
 * nubes de bloques que pasan despacio con el viento. La cupula va con la camara (nunca se llega a
 * ella). Sus colores van de un clima a otro poco a poco (`blendTo`); los de cada clima los da el mundo.
 */
import * as THREE from 'three';
import { WIND_DIRECTION } from './space';
import { toonMaterial } from './toon';

/** Como se ve el cielo con un clima: abajo (y la niebla del fondo), arriba, las nubes y cuanto se ve el sol (0 a 1). */
export interface SkyLook {
  horizon: number;
  zenith: number;
  cloud: number;
  sun: number;
}

/** Radio de la cupula: dentro del `far` de la camara, lejos de todo lo demas. */
const DOME_RADIUS = 350;
const SKY_BANDS = 6;
/** Altura (seno del angulo sobre el horizonte) a la que el cielo ya es del color del cenit. */
const ZENITH_FROM = 0.3;
/** Medio lado del sol cuadrado (en el plano perpendicular a su direccion) y de su halo. */
const SUN_HALF_SIDE = 0.084;
const HALO_SCALE = 1.7;
const SUN_COLOR = 0xfff6d8;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** El sol es un cuadrado (no un circulo): se mide en los dos ejes de su propio plano. */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSun;
uniform vec3 uSunDirection;
uniform float uSunShow;
varying vec3 vDirection;

float insideSquare(vec3 direction, float halfSide) {
  vec3 across = normalize(cross(uSunDirection, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(across, uSunDirection);
  vec2 onSun = abs(vec2(dot(direction, across), dot(direction, up)));
  return step(0.0, dot(direction, uSunDirection)) * step(max(onSun.x, onSun.y), halfSide);
}

void main() {
  vec3 direction = normalize(vDirection);
  float height = clamp(direction.y / ${ZENITH_FROM.toFixed(2)}, 0.0, 1.0);
  float band = min(floor(pow(height, 0.7) * ${SKY_BANDS.toFixed(1)}) / ${(SKY_BANDS - 1).toFixed(1)}, 1.0);
  vec3 color = mix(uHorizon, uZenith, band);
  color = mix(color, mix(color, uSun, 0.35), insideSquare(direction, ${(SUN_HALF_SIDE * HALO_SCALE).toFixed(3)}) * uSunShow);
  color = mix(color, uSun, insideSquare(direction, ${SUN_HALF_SIDE.toFixed(3)}) * uSunShow);
  gl_FragColor = vec4(color, 1.0);
}
`;

const CLOUD_COUNT = 26;
/** A que distancia del centro del mapa y a que altura van las nubes (bajas: se ven por encima del mar). */
const CLOUD_RING = { near: 60, far: 170 } as const;
const CLOUD_HEIGHT = { low: 9, high: 24 } as const;
/** Casillas por segundo que avanzan con el viento. */
const CLOUD_SPEED = 0.8;
/** Hasta donde se alejan del sitio de partida antes de volver por el otro lado (casillas a cada lado). */
const CLOUD_WRAP = 200;

/** Un bloque de una nube: su sitio (desde el centro de la nube) y su tamaño. */
interface CloudBlock {
  at: THREE.Vector3;
  size: THREE.Vector3;
}

/** Numeros al azar siempre iguales: el cielo es el mismo en cada partida. */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

/** Una nube de bloques: una losa ancha y unos bultos encima. */
function cloudBlocks(random: () => number): CloudBlock[] {
  const length = 10 + random() * 14;
  const depth = 5 + random() * 6;
  const slab = { at: new THREE.Vector3(), size: new THREE.Vector3(length, 2.5, depth) };
  const bumps = Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
    const width = 4 + random() * 6;
    const at = new THREE.Vector3((random() - 0.5) * (length - width), 2 + random() * 1.5, (random() - 0.5) * (depth - 3));
    return { at, size: new THREE.Vector3(width, 2 + random() * 2.5, Math.min(depth - 1, 3 + random() * 4)) };
  });
  return [slab, ...bumps];
}

/** Un sitio de partida para una nube: repartidas en un anillo alrededor del mapa. */
function cloudStart(center: THREE.Vector3, index: number, random: () => number): THREE.Vector3 {
  const angle = (index / CLOUD_COUNT) * Math.PI * 2 + random() * 0.4;
  const distance = CLOUD_RING.near + random() * (CLOUD_RING.far - CLOUD_RING.near);
  const height = CLOUD_HEIGHT.low + random() * (CLOUD_HEIGHT.high - CLOUD_HEIGHT.low);
  return new THREE.Vector3(center.x + Math.cos(angle) * distance, height, center.z + Math.sin(angle) * distance);
}

/** Lo que se ha ido una nube con el viento: de -CLOUD_WRAP a CLOUD_WRAP, y vuelta a empezar. */
function windShift(drift: number): number {
  const wrapped = (drift + CLOUD_WRAP) % (CLOUD_WRAP * 2);
  return wrapped - CLOUD_WRAP;
}

/** Las nubes, todas en una malla instanciada: cada bloque es una copia de un cubo con el material cartoon. */
class BlockClouds {
  readonly mesh: THREE.InstancedMesh;
  readonly material = toonMaterial(0xffffff).clone();
  private readonly blocks: { cloud: number; block: CloudBlock }[];
  private readonly starts: THREE.Vector3[];
  private drift = 0;

  constructor(center: THREE.Vector3) {
    const random = seededRandom(2013);
    const clouds = Array.from({ length: CLOUD_COUNT }, () => cloudBlocks(random));
    this.blocks = clouds.flatMap((blocks, cloud) => blocks.map((block) => ({ cloud, block })));
    this.starts = clouds.map((_, index) => cloudStart(center, index, random));
    // Estan mas alla de la niebla del fondo: con ella no se verian.
    this.material.fog = false;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, this.blocks.length);
    this.mesh.frustumCulled = false;
    this.place();
  }

  update(seconds: number): void {
    this.drift += seconds * CLOUD_SPEED;
    this.place();
  }

  private place(): void {
    const shift = WIND_DIRECTION.clone().multiplyScalar(windShift(this.drift));
    const matrix = new THREE.Matrix4();
    const noTurn = new THREE.Quaternion();
    this.blocks.forEach(({ cloud, block }, index) => {
      const at = this.starts[cloud]!.clone().add(shift).add(block.at);
      this.mesh.setMatrixAt(index, matrix.compose(at, noTurn, block.size));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Sky {
  readonly object = new THREE.Group();
  /** El color de abajo del cielo ahora mismo (la niebla del fondo lo copia). */
  readonly horizon = new THREE.Color();
  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: this.horizon },
    uSun: { value: new THREE.Color(SUN_COLOR) },
    uSunDirection: { value: new THREE.Vector3() },
    uSunShow: { value: 1 },
  };
  private readonly dome: THREE.Mesh;
  private readonly clouds: BlockClouds;

  constructor(center: THREE.Vector3, sunDirection: THREE.Vector3, look: SkyLook) {
    this.uniforms.uSunDirection.value.copy(sunDirection).normalize();
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), material);
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    this.clouds = new BlockClouds(center);
    this.object.add(this.dome, this.clouds.mesh);
    this.blendTo(look, 1);
  }

  /** Acerca los colores a los de `look` (0: nada, 1: del todo). */
  blendTo(look: SkyLook, blend: number): void {
    this.horizon.lerp(new THREE.Color(look.horizon), blend);
    this.uniforms.uZenith.value.lerp(new THREE.Color(look.zenith), blend);
    this.clouds.material.color.lerp(new THREE.Color(look.cloud), blend);
    this.uniforms.uSunShow.value += (look.sun - this.uniforms.uSunShow.value) * blend;
  }

  /** La cupula con la camara y las nubes con el viento. */
  update(seconds: number, cameraPosition: THREE.Vector3): void {
    this.dome.position.copy(cameraPosition);
    this.clouds.update(seconds);
  }
}
