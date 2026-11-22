/**
 * El mar que rodea el tablero (un aspecto del suelo de alrededor, surface.ts). Para que el tablero se
 * asiente en el y no parezca puesto encima, el agua cambia con la distancia a la orilla en escalones
 * de casilla (con el borde mellado, como un arrecife de pixel): bajio claro pegado al tablero, luego
 * medio y luego hondo, del azul del agua del tablero. En el pie de la tierra late una franja de
 * espuma, y cerca de ella titilan brillos cortos de pocos pixeles.
 */
import * as THREE from 'three';
import { type SurfaceLook, TEXELS_PER_TILE } from './surface';

/** Hasta cuantas casillas de la orilla llegan el bajio y el agua media. */
const SHALLOW_TILES = 2;
const MID_TILES = 6;
/** Hasta donde (casillas desde la orilla) hay brillos: mas lejos solo serian ruido de pixeles. */
const GLINT_TILES = 18;
/** Cuanto se mella el borde entre una franja y otra (casillas). */
const RAGGED_TILES = 1.6;

/** Los tres tonos del mar, de la orilla a mar abierto. */
export interface SeaColors {
  shallow: number;
  mid: number;
  deep: number;
}

export const TEMPERATE_SEA: SeaColors = { shallow: 0x7fd0ec, mid: 0x5aa2e6, deep: 0x4678d4 };
/** El del pantano, verde de agua estancada. */
export const STAGNANT_SEA: SeaColors = { shallow: 0x5e8a6a, mid: 0x44725e, deep: 0x335e54 };
const FOAM_COLOR = new THREE.Color(0.93, 0.98, 1);
const GLINT_COLOR = new THREE.Color(0.86, 0.95, 1);

const TEXELS = TEXELS_PER_TILE.toFixed(1);
const SEA_PAINT = /* glsl */ `
  float tileDistance = tilesFromLand(tile) + surfaceHash(tile) * ${RAGGED_TILES.toFixed(2)};
  vec3 water = tileDistance < ${SHALLOW_TILES.toFixed(1)} ? uShallow : (tileDistance < ${MID_TILES.toFixed(1)} ? uMid : uDeep);
  diffuseColor.rgb = water * (0.96 + step(0.5, surfaceHash(tile + 17.0)) * 0.04);

  vec2 dash = floor(vec2(texel.x * ${(TEXELS_PER_TILE / 3).toFixed(4)}, texel.y * ${TEXELS}));
  float sparkle = surfaceHash(dash);
  float twinkle = step(fract(sparkle * 13.0 + uTime * 0.3), 0.3);
  float nearLand = step(tilesFromLand(texel), ${GLINT_TILES.toFixed(1)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uGlint, step(0.988, sparkle) * twinkle * nearLand * 0.8);

  float foamWidth = (2.5 + 1.5 * sin(uTime * 2.2 + texel.x * 1.7 + texel.y * 2.3)) / ${TEXELS};
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, step(tilesFromLand(texel), foamWidth) * 0.9);
`;

/** El mar con esos tonos. */
export function seaLook(colors: SeaColors): SurfaceLook {
  return { name: 'sea', colors: { ...colors, foam: FOAM_COLOR, glint: GLINT_COLOR }, paint: SEA_PAINT };
}
