/**
 * La arena dibujada por un shader en vez de por la textura de la casilla: dunas y ondas que siguen de
 * una casilla a otra (se calculan en el mundo, no en cada casilla: no hay cortes ni repeticion),
 * con pocos tonos (como pixel art) y en pasos de un texel (16 por casilla). Las dunas se alargan de
 * traves al viento (el mismo del clima y el polvo) y se iluminan por laderas; las ondas avanzan muy
 * despacio; algun grano brilla de vez en cuando. Solo la cara de arriba: los lados siguen con su
 * textura de arenisca. La niebla lo oscurece despues, como al resto.
 */
import * as THREE from 'three';
import { WIND_DIRECTION } from './space';
import { SUN_DIRECTION } from './world';

const TEXELS_PER_TILE = 16;

/** Los tonos de la arena: ladera en sombra, llano, ladera al sol y cresta de onda. */
const SAND_TONES = ['#c98a3a', '#e3ac55', '#f2c66e', '#ffe2a0'].map((hex) => new THREE.Color(hex));
const GRAIN_COLOR = new THREE.Color('#fff4d0');
/** De donde viene el sol, en el suelo (el de la luz de world.ts): las laderas que lo miran se aclaran. */
const SUN_ON_GROUND = new THREE.Vector2(SUN_DIRECTION.x, SUN_DIRECTION.z).normalize();

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec3 uTones[4];
uniform vec3 uGrain;
uniform vec2 uWind;
uniform vec2 uSun;
varying vec3 vSandWorld;
varying float vSandUp;

float sandHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Ruido suave (valor interpolado): las dunas grandes. */
float sandNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = sandHash(cell);
  float b = sandHash(cell + vec2(1.0, 0.0));
  float c = sandHash(cell + vec2(0.0, 1.0));
  float d = sandHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** La altura de las dunas: dos tamaños de ruido, mas grandes de traves al viento. */
float duneHeight(vec2 p) {
  vec2 across = vec2(-uWind.y, uWind.x);
  vec2 stretched = vec2(dot(p, uWind), dot(p, across) * 0.55);
  return sandNoise(stretched * 0.5) * 0.7 + sandNoise(stretched * 1.3 + 5.1) * 0.3;
}
`;

/**
 * El tono de cada texel: las dunas son un relieve de ruido; sus laderas de cara al sol se aclaran y
 * las de espaldas se oscurecen (en pocos tonos, como la luz cartoon), y a trozos cruzan ondas finas
 * de traves al viento (solo su cresta, clara).
 */
const FRAGMENT_SAND = /* glsl */ `
  if (vSandUp > 0.5) {
    vec2 texel = floor(vSandWorld.xz * ${TEXELS_PER_TILE.toFixed(1)}) / ${TEXELS_PER_TILE.toFixed(1)};
    float step2 = 1.0 / ${TEXELS_PER_TILE.toFixed(1)};
    float height = duneHeight(texel);
    vec2 slope = vec2(duneHeight(texel + vec2(step2, 0.0)) - height, duneHeight(texel + vec2(0.0, step2)) - height);
    float sunward = dot(slope, uSun) * ${TEXELS_PER_TILE.toFixed(1)};
    float level = 1.0 + step(0.05, sunward) - step(sunward, -0.05);
    float ripples = step(0.55, sandNoise(texel * 0.45 + 3.7));
    float crest = ripples * step(fract(dot(texel, uWind) * 3.0 + height * 5.0 - uTime * 0.012), 0.08);
    level = clamp(level + crest, 0.0, 3.0);
    vec3 sand = level < 0.5 ? uTones[0] : level < 1.5 ? uTones[1] : level < 2.5 ? uTones[2] : uTones[3];
    float grain = step(0.985, sandHash(texel * 3.1)) * step(0.6, sin(uTime * 2.5 + sandHash(texel) * 40.0));
    diffuseColor.rgb = mix(sand, uGrain, grain);
  }
`;

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSandWorld;
varying float vSandUp;
`;

const VERTEX_SAND = /* glsl */ `
  vSandWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vSandUp = (instanceMatrix * vec4(normal, 0.0)).y;
`;

/** El reloj de la arena (lo adelanta el terreno en cada fotograma). */
export const sandClock = { value: 0 };

/** El material de arena a partir del de la casilla (la misma luz cartoon; los lados, con su textura). */
export function sandMaterial(base: THREE.Material): THREE.Material {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sandClock;
    shader.uniforms.uTones = { value: SAND_TONES };
    shader.uniforms.uGrain = { value: GRAIN_COLOR };
    shader.uniforms.uWind = { value: new THREE.Vector2(WIND_DIRECTION.x, WIND_DIRECTION.z) };
    shader.uniforms.uSun = { value: SUN_ON_GROUND };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_SAND}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_SAND}`);
  };
  material.customProgramCacheKey = () => 'ilogic-sand';
  return material;
}
