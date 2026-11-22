/**
 * El suelo que rodea el tablero hasta el horizonte, para que no flote en el vacio: un plano muy grande
 * un poco por debajo del tablero (se ve su borde, como un acantilado) que recibe la sombra del mapa y
 * se funde con la niebla del fondo. Lo que se pinta en el lo dice su aspecto (`SurfaceLook`): el mar
 * (sea.ts), el mar de dunas del desierto (duneSea.ts)... Todos saben a cuantas casillas esta la tierra
 * mas cercana (el borde del tablero o la orilla de un islote), para asentar el tablero con franjas de
 * la orilla hacia fuera, y van en pasos de un texel (16 por casilla), como las casillas.
 */
import * as THREE from 'three';
import { toonMaterial } from '../core/toon';
import type { Islet } from './islets';

/** Lo que mide el suelo (casillas de lado): pasa de sobra el horizonte de la niebla. */
const SURFACE_SIZE = 900;
/** Altura del suelo: algo por debajo del agua del tablero, para que se vea su borde. */
const SURFACE_LEVEL = -0.12;
export const TEXELS_PER_TILE = 16;
/** Los texels por casilla, como numero de GLSL. */
export const TEXELS_GLSL = TEXELS_PER_TILE.toFixed(1);
/** Cuanto se mella el borde entre una franja y la siguiente de cualquier suelo (casillas). */
export const RAGGED_TILES = 1.6;
/** Los uniforms que tiene cualquier suelo; los demas `u...` de su GLSL son sus colores. */
const COMMON_UNIFORMS = ['uTime', 'uBoardCenter', 'uBoardHalf', 'uIslets'];
/** Un islote de radio negativo, muy lejos, no cuenta (el shader necesita al menos un hueco). */
const NO_ISLET = new THREE.Vector3(1e6, 1e6, -1);

/** Como se pinta un suelo de alrededor. */
export interface SurfaceLook {
  /** Su nombre, para que three.js guarde un programa por aspecto. */
  name: string;
  /** Los colores que lee su GLSL, cada uno como `u` + su nombre con mayuscula (`shallow` es `uShallow`). */
  colors: Readonly<Record<string, THREE.ColorRepresentation>>;
  /**
   * El GLSL que pinta `diffuseColor.rgb`. Tiene a mano `texel` y `tile` (el centro del texel y de la
   * casilla de este punto, en casillas), `uTime` (segundos), `surfaceHash(celda)` (de 0 a 1, siempre
   * igual para la misma celda), `tilesFromLand(punto)` y lo que defina en `functions`.
   */
  paint: string;
  /** Funciones GLSL que usa `paint` (van fuera de `main`, despues de las comunes). */
  functions?: string;
}

/** La tierra que rodea el suelo: el tablero (centro en el suelo y medio lado, en casillas) y sus islotes. */
export interface Land {
  center: THREE.Vector3;
  half: THREE.Vector2;
  islets: readonly Islet[];
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vSurfaceWorld;
`;

const VERTEX_WORLD = /* glsl */ `
vSurfaceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uTime;
uniform vec2 uBoardCenter;
uniform vec2 uBoardHalf;
uniform vec3 uIslets[ISLET_SLOTS];
varying vec3 vSurfaceWorld;

float surfaceHash(vec2 cell) {
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

const FRAGMENT_POINT = /* glsl */ `
  vec2 texel = (floor(vSurfaceWorld.xz * ${TEXELS_GLSL}) + 0.5) / ${TEXELS_GLSL};
  vec2 tile = floor(vSurfaceWorld.xz + 0.5);
`;

const uniformName = (color: string): string => `u${color[0]?.toUpperCase() ?? ''}${color.slice(1)}`;

/**
 * Los uniforms que usa el GLSL de un aspecto y no son ni comunes ni de sus colores: tiene que no haber
 * ninguno (un color mal escrito, como `uSnwo`, solo fallaria al compilar el shader en el navegador).
 */
export function undeclaredUniforms(look: SurfaceLook): string[] {
  const declared = new Set([...COMMON_UNIFORMS, ...Object.keys(look.colors).map(uniformName)]);
  const used = `${look.paint}\n${look.functions ?? ''}`.match(/\bu[A-Z]\w*/g) ?? [];
  return [...new Set(used)].filter((name) => !declared.has(name));
}

export class Surface {
  readonly object: THREE.Mesh;
  private readonly clock = { value: 0 };

  constructor(look: SurfaceLook, land: Land) {
    const isletSlots = land.islets.length > 0 ? land.islets.map(({ at, radius }) => new THREE.Vector3(at.x, at.y, radius)) : [NO_ISLET];
    const colors = Object.entries(look.colors).map(([name, color]): [string, THREE.IUniform<THREE.Color>] => [
      uniformName(name),
      { value: new THREE.Color(color) },
    ]);
    const uniforms: Record<string, THREE.IUniform> = {
      uTime: this.clock,
      uBoardCenter: { value: new THREE.Vector2(land.center.x, land.center.z) },
      uBoardHalf: { value: land.half.clone() },
      uIslets: { value: isletSlots },
      ...Object.fromEntries(colors),
    };
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(SURFACE_SIZE, SURFACE_SIZE), surfaceMaterial(look, uniforms, isletSlots.length));
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.set(land.center.x, SURFACE_LEVEL, land.center.z);
    this.object.receiveShadow = true;
  }

  update(seconds: number): void {
    this.clock.value += seconds;
  }
}

function surfaceMaterial(look: SurfaceLook, uniforms: Record<string, THREE.IUniform>, isletSlots: number): THREE.Material {
  const colorUniforms = Object.keys(look.colors).map((name) => `uniform vec3 ${uniformName(name)};`);
  const head = [FRAGMENT_HEAD.replaceAll('ISLET_SLOTS', String(isletSlots)), ...colorUniforms, look.functions ?? ''].join('\n');
  const material = toonMaterial(0xffffff).clone();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VERTEX_WORLD}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${head}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT_POINT}\n${look.paint}`);
  };
  material.customProgramCacheKey = () => `ilogic-surface-${look.name}-${isletSlots}`;
  return material;
}
