/**
 * El mar de dunas del desierto (un aspecto del suelo de alrededor, surface.ts): arena hasta el
 * horizonte en vez de agua. Pegada al tablero y a las mesetas, la arena que el viento amontona contra
 * la roca, lisa y clara (hace de bajio: asienta el tablero); mas alla, dunas de traves al viento (el
 * mismo que ondula la arena del tablero), cada vez mas marcadas hacia fuera, en escalones de casilla
 * con el borde mellado, como el mar. Cada duna: la cara al viento larga y al sol, en dos tonos, la
 * cresta clara y la cara de sotavento en sombra. Por encima corren con el viento hilos de arena.
 */
import { WIND_DIRECTION } from '../core/space';
import { type SurfaceLook, TEXELS_PER_TILE } from './surface';

/** Hasta cuantas casillas de la tierra llega la arena amontonada y desde cuantas las dunas se ven del todo. */
const DRIFT_TILES = 1.5;
const FULL_DUNE_TILES = 5;
/** Cuanto se mella el borde entre una franja y otra (casillas). */
const RAGGED_TILES = 1.6;
/** De una cresta a la siguiente (casillas). */
const DUNE_WAVELENGTH = 4.5;
/**
 * Donde empieza cada tono a lo largo de una duna (de 0 a 1, a favor del viento): el pie, la cara al
 * sol, la cresta y la cara de sotavento, que es empinada y desde arriba se ve estrecha.
 */
const SUNNY_FACE = 0.4;
const CREST = 0.8;
const LEE_FACE = 0.84;
/** Lo que se notan las dunas entre la arena amontonada y lejos (de 0, lisa, a 1, todo su color). */
const NEAR_DUNES = 0.45;
const FAR_DUNES = 0.8;
/** Cuanto se mella el borde entre los tonos de una duna, en bloques de unos texels (como pixel art, no ruido de puntos). */
const DUNE_RAGGED = 0.025;
const RAGGED_BLOCK_TEXELS = 3;
/** Hasta donde (casillas desde la tierra) corren los hilos de arena, y lo rapido que van (casillas por segundo). */
const WISP_TILES = 14;
const WISP_SPEED = 1.2;

/** Los tonos de la arena: la amontonada, la del pie de cada duna, su cara al sol, su cresta y su sombra. */
const SAND_COLORS = {
  drift: 0xf3d08a,
  sand: 0xe0aa5c,
  lit: 0xebbd6c,
  crest: 0xf9dc9c,
  shade: 0xcf9550,
};

const TEXELS = TEXELS_PER_TILE.toFixed(1);
const DUNE_PAINT = /* glsl */ `
  vec2 wind = vec2(${WIND_DIRECTION.x.toFixed(4)}, ${WIND_DIRECTION.z.toFixed(4)});
  float along = dot(texel, wind);
  float across = dot(texel, vec2(-wind.y, wind.x));
  float bend = sin(across * 0.23) * 1.4 + sin(across * 0.61 + 1.3) * 0.5;
  float ragged = (surfaceHash(floor(texel * ${(TEXELS_PER_TILE / RAGGED_BLOCK_TEXELS).toFixed(4)})) - 0.5) * ${DUNE_RAGGED.toFixed(3)};
  float phase = fract((along + bend) / ${DUNE_WAVELENGTH.toFixed(2)} + ragged);
  vec3 dune = phase < ${SUNNY_FACE.toFixed(2)} ? uSand : (phase < ${CREST.toFixed(2)} ? uLit : (phase < ${LEE_FACE.toFixed(2)} ? uCrest : uShade));

  float tileDistance = tilesFromLand(tile) + surfaceHash(tile) * ${RAGGED_TILES.toFixed(2)};
  float strength = tileDistance < ${DRIFT_TILES.toFixed(1)} ? 0.0 : (tileDistance < ${FULL_DUNE_TILES.toFixed(1)} ? ${NEAR_DUNES.toFixed(2)} : ${FAR_DUNES.toFixed(2)});
  vec3 ground = tileDistance < ${DRIFT_TILES.toFixed(1)} ? uDrift : uSand;
  diffuseColor.rgb = mix(ground, dune, strength) * (0.97 + step(0.5, surfaceHash(tile + 17.0)) * 0.03);

  vec2 streak = floor(vec2((along - uTime * ${WISP_SPEED.toFixed(2)}) * ${(TEXELS_PER_TILE / 4).toFixed(4)}, across * ${TEXELS}));
  float nearLand = step(tilesFromLand(texel), ${WISP_TILES.toFixed(1)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uCrest, step(0.996, surfaceHash(streak)) * nearLand * 0.7);
`;

export const DUNE_SEA: SurfaceLook = { name: 'dunes', colors: SAND_COLORS, paint: DUNE_PAINT };
