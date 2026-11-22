/**
 * El agua que se mueve, sin perder el pixel art: el mismo material cartoon de la casilla de Ashfox con
 * tres cosas mas en su shader, todas en pasos de un texel (16 por casilla) para que sigan pareciendo
 * pixeles:
 * - oleaje: la cara de arriba sube y baja un poco, con un desfase por casilla;
 * - brillos: vetas claras que cruzan el agua despacio;
 * - espuma: una franja clara que late en los lados que dan a tierra (`shoreSides`);
 * - orilla del mapa: el lateral que da fuera del mapa (`edgeSides`) es de tierra, la del lateral de las
 *   casillas de tierra del tema (`BankColors`). Si no, el agua acababa en una pared azul frente al
 *   suelo de alrededor, que con las dunas y el hielo se notaba mucho.
 * Funciona con las casillas instanciadas (cada copia sabe sus orillas por un atributo) y con la niebla,
 * que oscurece despues (el color de cada copia). Los brillos y la espuma son del color de su agua
 * (`WaterLook`): blancos en la clara y verdosos en la turbia del pantano.
 */
import * as THREE from 'three';
import { terrainAt } from '../../../core/gameContent';
import { isOnBoard } from '../../../core/mapGrid';
import type { GameState, Pos } from '../../../core/model';

const TEXELS_PER_TILE = 16;
/** Lo que sube y baja la superficie (casillas). */
const WAVE_HEIGHT = 0.012;
/** Por debajo de esta altura no se mueve: es el fondo del bloque (que no se ve). */
const SURFACE_FROM = -0.2;
/** Que parte de los texels de la tierra de la orilla va en sombra y cual con luz (los demas, en su tono medio). */
const BANK_SHADE_SHARE = 0.2;
const BANK_LIGHT_SHARE = 0.15;

/** El color de los brillos y de la espuma de una clase de agua. */
export interface WaterLook {
  glint: THREE.Color;
  foam: THREE.Color;
}

export const CLEAR_WATER: WaterLook = { glint: new THREE.Color(0.86, 0.95, 1), foam: new THREE.Color(0.93, 0.98, 1) };
/** El agua del pantano: brillos verdosos y, en la orilla, verdin en vez de espuma blanca. */
export const MURKY_WATER: WaterLook = { glint: new THREE.Color(0.6, 0.76, 0.52), foam: new THREE.Color(0.46, 0.62, 0.3) };

/** Los tonos de la tierra que sujeta el agua en el borde del mapa: el de sombra, el medio y el de luz. */
export interface BankColors {
  shade: number;
  middle: number;
  light: number;
}

/** Los lados de una casilla, en el orden del atributo: norte (-z), este (+x), sur (+z), oeste (-x). */
const SIDES: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Para cada casilla, 1 en los lados cuya casilla de al lado cumple `marks` y 0 en los demas. */
function sideFlags(positions: readonly Pos[], marks: (next: Pos) => boolean): THREE.InstancedBufferAttribute {
  const flags = positions.flatMap((pos) => SIDES.map((side) => (marks({ x: pos.x + side.x, y: pos.y + side.y }) ? 1 : 0)));
  return new THREE.InstancedBufferAttribute(new Float32Array(flags), 4);
}

/** Para cada casilla, 1 en los lados que dan a tierra (ahi va la espuma) y 0 en los demas. */
export const shoreSides = (s: GameState, positions: readonly Pos[]): THREE.InstancedBufferAttribute =>
  sideFlags(positions, (next) => isOnBoard(s, next) && !terrainAt(s, next).isWater);

/** Para cada casilla, 1 en los lados que dan fuera del mapa (ahi el lateral es de tierra) y 0 en los demas. */
export const edgeSides = (s: GameState, positions: readonly Pos[]): THREE.InstancedBufferAttribute =>
  sideFlags(positions, (next) => !isOnBoard(s, next));

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
attribute vec4 aShore;
attribute vec4 aEdge;
varying vec3 vWaterWorld;
varying float vRestHeight;
varying vec4 vShore;
varying float vUp;
varying float vBank;
`;

const VERTEX_WAVE = /* glsl */ `
  vec4 tileOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec4 restWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  float isSurface = step(${SURFACE_FROM.toFixed(2)}, restWorld.y);
  transformed.y += isSurface * sin(uTime * 1.6 + tileOrigin.x * 0.9 + tileOrigin.z * 0.7) * ${WAVE_HEIGHT.toFixed(3)};
  vWaterWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vRestHeight = restWorld.y;
  vShore = aShore;
  vUp = normal.y;
  // Los laterales del bloque miran justo a un lado (norte, este, sur u oeste): step elige ese; arriba y abajo, ninguno.
  vec3 facing = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
  vBank = dot(aEdge, step(0.5, vec4(-facing.z, facing.x, facing.z, -facing.x)));
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec3 uGlint;
uniform vec3 uFoam;
uniform vec3 uBankShade;
uniform vec3 uBank;
uniform vec3 uBankLight;
varying vec3 vWaterWorld;
varying float vRestHeight;
varying vec4 vShore;
varying float vUp;
varying float vBank;

float waterHash(vec2 cell) {
  return fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
}
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
  // Con la altura sin oleaje: si no, la fila de arriba cambiaria de tono al subir y bajar la ola.
  float grain = waterHash(floor(vec2(vWaterWorld.x + vWaterWorld.z, vRestHeight) * ${TEXELS_PER_TILE.toFixed(1)}));
  vec3 bank = grain < ${BANK_SHADE_SHARE.toFixed(2)} ? uBankShade : (grain < ${(1 - BANK_LIGHT_SHARE).toFixed(2)} ? uBank : uBankLight);
  diffuseColor.rgb = mix(diffuseColor.rgb, bank, vBank);
`;

/** El reloj de todos los materiales de agua (lo adelanta el terreno en cada fotograma). */
export const waterClock = { value: 0 };

/**
 * El material de agua a partir del de la casilla (la misma textura y la misma luz cartoon), con sus
 * brillos, su espuma y, en el borde del mapa, la tierra `bank`.
 */
export function waterMaterial(base: THREE.Material, look: WaterLook, bank: BankColors): THREE.Material {
  const material = base.clone();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterClock;
    shader.uniforms.uGlint = { value: look.glint };
    shader.uniforms.uFoam = { value: look.foam };
    shader.uniforms.uBankShade = { value: new THREE.Color(bank.shade) };
    shader.uniforms.uBank = { value: new THREE.Color(bank.middle) };
    shader.uniforms.uBankLight = { value: new THREE.Color(bank.light) };
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
