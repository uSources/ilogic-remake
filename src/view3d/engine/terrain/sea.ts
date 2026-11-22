/**
 * El mar que rodea el tablero hasta el horizonte, para que no flote en el vacio: un plano muy grande
 * un poco por debajo del agua del tablero que recibe la sombra del mapa y se funde con la niebla del
 * fondo. Para que el tablero se asiente en el y no parezca puesto encima, el agua cambia con la
 * distancia a la orilla en escalones de casilla (con el borde mellado, como un arrecife de pixel):
 * bajio claro pegado al tablero, luego medio y luego hondo, del azul del agua del tablero. En el pie
 * del tablero late una franja de espuma, y por todo el mar titilan brillos cortos de pocos pixeles.
 * Los islotes (islets.ts) tienen tambien su bajio y su espuma. Todo en pasos de un texel (16 por
 * casilla), como el agua del tablero (water.ts).
 */
import * as THREE from 'three';
import { toonMaterial } from '../core/toon';
import type { Islet } from './islets';

/** Lo que mide el mar (casillas de lado): pasa de sobra el horizonte de la niebla. */
const SEA_SIZE = 900;
/** Altura de la superficie: algo por debajo del agua del tablero, para que se vea su borde. */
const SEA_LEVEL = -0.12;
const TEXELS_PER_TILE = 16;
/** Hasta cuantas casillas de la orilla llegan el bajio y el agua media. */
const SHALLOW_TILES = 2;
const MID_TILES = 6;
/** Hasta donde (casillas desde la orilla) hay brillos: mas lejos solo serian ruido de pixeles. */
const GLINT_TILES = 18;
/** Cuanto se mella el borde entre una franja y otra (casillas). */
const RAGGED_TILES = 1.6;

/** Los tres tonos del mar (de la orilla a mar abierto) de un tema. */
interface SeaColors {
  shallow: number;
  mid: number;
  deep: number;
}

const TEMPERATE_SEA: SeaColors = { shallow: 0x7fd0ec, mid: 0x5aa2e6, deep: 0x4678d4 };
/** El mar por tema del mapa (id de themes.json); el que no esta, el templado. */
const SEA_BY_THEME: Readonly<Record<string, SeaColors>> = {
  Desert: { shallow: 0x7fe0d6, mid: 0x3fb2d0, deep: 0x2f7cc4 },
  Swamp: { shallow: 0x5e8a6a, mid: 0x44725e, deep: 0x335e54 },
  Snowy: { shallow: 0x9cc8e8, mid: 0x5b8cc8, deep: 0x4466aa },
};
const NO_ISLET = new THREE.Vector3(1e6, 1e6, -1);
const FOAM_COLOR = new THREE.Color(0.93, 0.98, 1);
const GLINT_COLOR = new THREE.Color(0.86, 0.95, 1);

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSeaWorld;
`;

const VERTEX_WORLD = /* glsl */ `
vSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec2 uBoardCenter;
uniform vec2 uBoardHalf;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uGlint;
uniform vec3 uIslets[ISLET_SLOTS];
varying vec3 vSeaWorld;

float seaHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}

/** Casillas hasta la tierra mas cercana: el borde del tablero (en linea recta) o la orilla de un islote. */
float tilesFromLand(vec2 point) {
  vec2 outside = abs(point - uBoardCenter) - uBoardHalf;
  float nearest = max(outside.x, outside.y);
  for (int index = 0; index < ISLET_SLOTS; index++) {
    nearest = min(nearest, length(point - uIslets[index].xy) - uIslets[index].z);
  }
  return max(nearest, 0.0);
}
`;

const FRAGMENT_SEA = /* glsl */ `
  vec2 texel = (floor(vSeaWorld.xz * ${TEXELS_PER_TILE.toFixed(1)}) + 0.5) / ${TEXELS_PER_TILE.toFixed(1)};
  vec2 tile = floor(vSeaWorld.xz + 0.5);
  float tileDistance = tilesFromLand(tile) + seaHash(tile) * ${RAGGED_TILES.toFixed(2)};
  vec3 water = tileDistance < ${SHALLOW_TILES.toFixed(1)} ? uShallow : (tileDistance < ${MID_TILES.toFixed(1)} ? uMid : uDeep);
  diffuseColor.rgb = water * (0.96 + step(0.5, seaHash(tile + 17.0)) * 0.04);

  vec2 dash = floor(vec2(texel.x * ${(TEXELS_PER_TILE / 3).toFixed(4)}, texel.y * ${TEXELS_PER_TILE.toFixed(1)}));
  float sparkle = seaHash(dash);
  float twinkle = step(fract(sparkle * 13.0 + uTime * 0.3), 0.3);
  float nearLand = step(tilesFromLand(texel), ${GLINT_TILES.toFixed(1)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uGlint, step(0.988, sparkle) * twinkle * nearLand * 0.8);

  float foamWidth = (2.5 + 1.5 * sin(uTime * 2.2 + texel.x * 1.7 + texel.y * 2.3)) / ${TEXELS_PER_TILE.toFixed(1)};
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, step(tilesFromLand(texel), foamWidth) * 0.9);
`;

export class Sea {
  readonly object: THREE.Mesh;
  private readonly clock = { value: 0 };

  /**
   * El mar alrededor de un tablero de ese centro (en el suelo) y medio lado (casillas, por x y por z)
   * y de sus islotes, con los tonos del tema (`theme`, id de themes.json).
   */
  constructor(center: THREE.Vector3, half: THREE.Vector2, islets: readonly Islet[], theme: string) {
    const colors = SEA_BY_THEME[theme] ?? TEMPERATE_SEA;
    // Un hueco por islote; un islote de radio negativo, muy lejos, no cuenta.
    const isletSlots = islets.length > 0 ? islets.map(({ at, radius }) => new THREE.Vector3(at.x, at.y, radius)) : [NO_ISLET];
    const uniforms = {
      uTime: this.clock,
      uBoardCenter: { value: new THREE.Vector2(center.x, center.z) },
      uBoardHalf: { value: half.clone() },
      uShallow: { value: new THREE.Color(colors.shallow) },
      uMid: { value: new THREE.Color(colors.mid) },
      uDeep: { value: new THREE.Color(colors.deep) },
      uFoam: { value: FOAM_COLOR },
      uGlint: { value: GLINT_COLOR },
      uIslets: { value: isletSlots },
    };
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE), seaMaterial(uniforms, isletSlots.length));
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.set(center.x, SEA_LEVEL, center.z);
    this.object.receiveShadow = true;
  }

  update(seconds: number): void {
    this.clock.value += seconds;
  }
}

function seaMaterial(uniforms: Record<string, THREE.IUniform>, isletSlots: number): THREE.Material {
  const material = toonMaterial(0xffffff).clone();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD.replaceAll('ISLET_SLOTS', String(isletSlots))}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_SEA}`);
  };
  material.customProgramCacheKey = () => `ilogic-sea-${isletSlots}`;
  return material;
}
