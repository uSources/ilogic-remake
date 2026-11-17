/**
 * El cielo de juguete: una cupula con un degradado en bandas secas (del horizonte claro al cenit mas
 * azul; sin degradado suave, como la rampa de dos tonos de las piezas), un sol cuadrado de pixel y
 * nubes de voxels redondeadas (blancas arriba, con el fondo azul gris) que pasan despacio con el viento. La cupula va con la camara (nunca se llega a
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

/** Lado de un voxel de nube (casillas): los bultos se ven como bloques de juguete, no como losas. */
const CLOUD_VOXEL = 1.6;
/** Blanco por arriba; el fondo de la nube, de un azul gris que lo asienta en el cielo. */
const CLOUD_BELLY = new THREE.Color(0xdbe6f6);
const CLOUD_WHITE = new THREE.Color(0xffffff);
/** Cuanta luz propia tienen las nubes (0 a 1): sin ella, el lado de sombra se ve gris de piedra. */
const CLOUD_GLOW = 0.5;

/** Una esfera de la nube, en voxels: su centro (y apoyado sobre el suelo de la nube) y su radio. */
interface Puff {
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Un voxel de una nube: su sitio (desde el centro de la nube, en casillas) y si es del fondo. */
interface CloudVoxel {
  at: THREE.Vector3;
  belly: boolean;
}

/** Numeros al azar siempre iguales: el cielo es el mismo en cada partida. */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

/** Los bultos de una nube: unas cuantas esferas alineadas, de tamaños distintos y apoyadas en el suelo. */
function cloudPuffs(random: () => number): Puff[] {
  const count = 3 + Math.floor(random() * 3);
  const spread = 4 + random() * 4;
  return Array.from({ length: count }, (_, index) => {
    const along = count === 1 ? 0 : index / (count - 1) - 0.5;
    return {
      x: along * spread,
      y: 2 + random() * 1.5,
      z: (random() - 0.5) * 2.5,
      radius: 2.2 + random() * 1.8 - Math.abs(along),
    };
  });
}

function insideAnyPuff(point: THREE.Vector3, puffs: readonly Puff[]): boolean {
  return puffs.some((puff) => point.distanceToSquared(new THREE.Vector3(puff.x, puff.y, puff.z)) <= puff.radius ** 2);
}

/**
 * Una nube: los voxels de la suma de sus esferas, con el suelo plano (el fondo, en otro tono). Los
 * voxels caen en una rejilla, asi que el borde sale escalonado como el pixel art.
 */
function cloudVoxels(random: () => number): CloudVoxel[] {
  const puffs = cloudPuffs(random);
  const voxels: CloudVoxel[] = [];
  for (let x = -12; x < 12; x++) {
    for (let y = 0; y < 9; y++) {
      for (let z = -6; z < 6; z++) {
        const center = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
        if (insideAnyPuff(center, puffs)) {
          voxels.push({ at: center.multiplyScalar(CLOUD_VOXEL), belly: y === 0 });
        }
      }
    }
  }
  return voxels;
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

/**
 * Las nubes, todas en una malla instanciada: cada voxel es una copia de un cubo con el material
 * cartoon (blanco arriba y azul gris por el fondo). El viento solo mueve la posicion de cada copia.
 */
class VoxelClouds {
  readonly mesh: THREE.InstancedMesh;
  readonly material = toonMaterial(0xffffff).clone();
  private readonly voxels: { cloud: number; voxel: CloudVoxel }[];
  private readonly starts: THREE.Vector3[];
  private drift = 0;

  constructor(center: THREE.Vector3) {
    const random = seededRandom(2013);
    const clouds = Array.from({ length: CLOUD_COUNT }, () => cloudVoxels(random));
    this.voxels = clouds.flatMap((voxels, cloud) => voxels.map((voxel) => ({ cloud, voxel })));
    this.starts = clouds.map((_, index) => cloudStart(center, index, random));
    // Estan mas alla de la niebla del fondo: con ella no se verian.
    this.material.fog = false;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CLOUD_VOXEL, CLOUD_VOXEL, CLOUD_VOXEL), this.material, this.voxels.length);
    this.mesh.frustumCulled = false;
    this.voxels.forEach(({ voxel }, index) => this.mesh.setColorAt(index, voxel.belly ? CLOUD_BELLY : CLOUD_WHITE));
    this.place();
  }

  /** Acerca el color de las nubes a `color`: la luz propia (emisiva) sigue al color para que la sombra no se ensucie. */
  lerpTone(color: THREE.ColorRepresentation, blend: number): void {
    this.material.color.lerp(new THREE.Color(color), blend);
    this.material.emissive.copy(this.material.color).multiplyScalar(CLOUD_GLOW);
  }

  update(seconds: number): void {
    this.drift += seconds * CLOUD_SPEED;
    this.place();
  }

  /** Solo la posicion (columna 4 de cada matriz): la escala y el giro no cambian. */
  private place(): void {
    const shift = WIND_DIRECTION.clone().multiplyScalar(windShift(this.drift));
    const elements = this.mesh.instanceMatrix.array;
    this.voxels.forEach(({ cloud, voxel }, index) => {
      const start = this.starts[cloud]!;
      const offset = index * 16;
      elements[offset + 12] = start.x + shift.x + voxel.at.x;
      elements[offset + 13] = start.y + voxel.at.y;
      elements[offset + 14] = start.z + shift.z + voxel.at.z;
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
  private readonly clouds: VoxelClouds;

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
    this.clouds = new VoxelClouds(center);
    this.object.add(this.dome, this.clouds.mesh);
    this.blendTo(look, 1);
  }

  /** Acerca los colores a los de `look` (0: nada, 1: del todo). */
  blendTo(look: SkyLook, blend: number): void {
    this.horizon.lerp(new THREE.Color(look.horizon), blend);
    this.uniforms.uZenith.value.lerp(new THREE.Color(look.zenith), blend);
    this.clouds.lerpTone(look.cloud, blend);
    this.uniforms.uSunShow.value += (look.sun - this.uniforms.uSunShow.value) * blend;
  }

  /** La cupula con la camara y las nubes con el viento. */
  update(seconds: number, cameraPosition: THREE.Vector3): void {
    this.dome.position.copy(cameraPosition);
    this.clouds.update(seconds);
  }
}
