/**
 * El mar que rodea el tablero hasta el horizonte, para que no flote en el vacio: un plano muy grande
 * un poco por debajo del agua del tablero (asi se ve el borde de tierra, como un acantilado) que
 * recibe la sombra del mapa y se funde con la niebla del fondo. Lleva el material cartoon con los
 * mismos brillos de pixel del agua del tablero (water.ts), en pasos de un texel.
 */
import * as THREE from 'three';
import { toonMaterial } from '../core/toon';

/** Lo que mide el mar (casillas de lado): pasa de sobra el horizonte de la niebla. */
const SEA_SIZE = 900;
/** Altura de la superficie: algo por debajo del agua del tablero, para que se vea su borde. */
const SEA_LEVEL = -0.12;
/** El color del mar por tema del mapa (id de themes.json); el que no esta, el de un mar templado. */
const SEA_COLORS: Readonly<Record<string, number>> = {
  Desert: 0x3fb2d0,
  Swamp: 0x4a8fa8,
  Snowy: 0x4f7fb4,
};
const TEMPERATE_SEA = 0x4a9ee2;
const TEXELS_PER_TILE = 16;

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSeaWorld;
`;

const VERTEX_WORLD = /* glsl */ `
vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
varying vec3 vSeaWorld;
`;

/** Casillas un poco mas claras u oscuras (se lee la cuadricula) y brillos de pixel que cruzan. */
const FRAGMENT_SEA = /* glsl */ `
  vec2 texel = floor(vSeaWorld.xz * ${TEXELS_PER_TILE.toFixed(1)}) / ${TEXELS_PER_TILE.toFixed(1)};
  vec2 tile = floor(vSeaWorld.xz + 0.5);
  float tileShade = step(0.5, fract(sin(dot(tile, vec2(12.9898, 78.233))) * 43758.5453));
  diffuseColor.rgb *= 0.94 + tileShade * 0.06;
  float glint = step(0.975, fract(texel.x * 0.35 + texel.y * 0.6 + uTime * 0.18 + sin(texel.y * 3.1) * 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.95, 1.0), glint * 0.7);
`;

function seaMaterial(color: number, clock: { value: number }): THREE.Material {
  const material = toonMaterial(color).clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_SEA}`);
  };
  material.customProgramCacheKey = () => 'ilogic-sea';
  return material;
}

export class Sea {
  readonly object: THREE.Mesh;
  private readonly clock = { value: 0 };

  /** El mar centrado en el mapa (`center`, en el suelo), del color del tema (`theme`, id de themes.json). */
  constructor(center: THREE.Vector3, theme: string) {
    const material = seaMaterial(SEA_COLORS[theme] ?? TEMPERATE_SEA, this.clock);
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE), material);
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.set(center.x, SEA_LEVEL, center.z);
    this.object.receiveShadow = true;
  }

  update(seconds: number): void {
    this.clock.value += seconds;
  }
}
