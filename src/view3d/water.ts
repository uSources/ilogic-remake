/**
 * El agua que se mueve, sin perder el pixel art: el mismo material cartoon de la casilla de Ashfox con
 * tres cosas mas en su shader, todas en pasos de un texel (16 por casilla) para que sigan pareciendo
 * pixeles:
 * - oleaje: la cara de arriba sube y baja un poco, con un desfase por casilla;
 * - brillos: vetas claras que cruzan el agua despacio;
 * - espuma: una franja clara que late en los lados que dan a tierra (`shoreSides`).
 * Funciona con las casillas instanciadas (cada copia sabe sus orillas por un atributo) y con la niebla,
 * que oscurece despues (el color de cada copia).
 */
import * as THREE from 'three';
import { terrainAt } from '../core/gameContent';
import { isOnBoard } from '../core/mapGrid';
import type { GameState, Pos } from '../core/model';

const TEXELS_PER_TILE = 16;
/** Lo que sube y baja la superficie (casillas). */
const WAVE_HEIGHT = 0.012;
/** Por debajo de esta altura no se mueve: es el fondo del bloque (que no se ve). */
const SURFACE_FROM = -0.2;
const GLINT_COLOR = new THREE.Color(0.86, 0.95, 1);
const FOAM_COLOR = new THREE.Color(0.93, 0.98, 1);

/** Los lados de una casilla, en el orden del atributo: norte (-z), este (+x), sur (+z), oeste (-x). */
const SIDES: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Para cada casilla, 1 en los lados que dan a tierra (ahi va la espuma) y 0 en los demas. */
export function shoreSides(s: GameState, positions: readonly Pos[]): THREE.InstancedBufferAttribute {
  const flags = positions.flatMap((pos) =>
    SIDES.map((side) => {
      const next = { x: pos.x + side.x, y: pos.y + side.y };
      return isOnBoard(s, next) && !terrainAt(s, next).isWater ? 1 : 0;
    }),
  );
  return new THREE.InstancedBufferAttribute(new Float32Array(flags), 4);
}

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
attribute vec4 aShore;
varying vec3 vWaterWorld;
varying vec4 vShore;
varying float vUp;
`;

const VERTEX_WAVE = /* glsl */ `
  vec4 tileOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 restWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  float isSurface = step(${SURFACE_FROM.toFixed(2)}, restWorld.y);
  transformed.y += isSurface * sin(uTime * 1.6 + tileOrigin.x * 0.9 + tileOrigin.z * 0.7) * ${WAVE_HEIGHT.toFixed(3)};
  vWaterWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vShore = aShore;
  vUp = normal.y;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec3 uGlint;
uniform vec3 uFoam;
varying vec3 vWaterWorld;
varying vec4 vShore;
varying float vUp;
`;

/** Brillos y espuma sobre el color de la textura (antes de la niebla, que lo oscurece todo igual). */
const FRAGMENT_WATER = /* glsl */ `
  float topFace = step(0.5, vUp);
  vec2 texel = floor(vWaterWorld.xz * ${TEXELS_PER_TILE.toFixed(1)}) / ${TEXELS_PER_TILE.toFixed(1)};
  float glint = step(0.955, fract(texel.x * 0.35 + texel.y * 0.6 + uTime * 0.18 + sin(texel.y * 3.1) * 0.15));
  diffuseColor.rgb = mix(diffuseColor.rgb, uGlint, glint * topFace * 0.75);
  vec2 local = floor(fract(vWaterWorld.xz + 0.5) * ${TEXELS_PER_TILE.toFixed(1)}) / ${TEXELS_PER_TILE.toFixed(1)};
  float width = (1.5 + sin(uTime * 2.2 + texel.x * 2.0 + texel.y * 3.0)) / ${TEXELS_PER_TILE.toFixed(1)};
  float foam = max(max(vShore.x * step(local.y, width), vShore.y * step(1.0 - local.x, width)),
                   max(vShore.z * step(1.0 - local.y, width), vShore.w * step(local.x, width)));
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, foam * topFace * 0.85);
`;

/** El reloj de todos los materiales de agua (lo adelanta el terreno en cada fotograma). */
export const waterClock = { value: 0 };

/** El material de agua a partir del de la casilla (la misma textura y la misma luz cartoon). */
export function waterMaterial(base: THREE.Material): THREE.Material {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterClock;
    shader.uniforms.uGlint = { value: GLINT_COLOR };
    shader.uniforms.uFoam = { value: FOAM_COLOR };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_WAVE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_WATER}`);
  };
  material.customProgramCacheKey = () => 'ilogic-water';
  return material;
}
