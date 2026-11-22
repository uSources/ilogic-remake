/**
 * El mar helado del nevado (un aspecto del suelo de alrededor, surface.ts). Cambia con la distancia a
 * la tierra en escalones de casilla con el borde mellado, como el mar: pegado a la orilla, agua
 * abierta con trozos de hielo sueltos (enlaza con el agua del tablero y hace que destaque su borde);
 * luego, tempanos separados por canales de agua; y lejos, la banquisa, placas juntas con grietas
 * finas. Las placas son celdas de Voronoi en texels, cada una de su tono (hielo, hielo en sombra o nevada);
 * al pie de la tierra queda un reborde de hielo blanco y sobre el hielo titila la escarcha.
 */
import { RAGGED_TILES, type SurfaceLook, TEXELS_GLSL, TEXELS_PER_TILE } from './surface';

/** Hasta cuantas casillas de la tierra hay agua abierta y hasta cuantas tempanos sueltos (luego, banquisa). */
const OPEN_WATER_TILES = 1.5;
const LOOSE_FLOE_TILES = 6;
/** Lo que mide cada placa (casillas): trozos sueltos en el agua, tempanos y placas de la banquisa. */
const CHUNK_SIZE = 1.1;
const FLOE_SIZE = 2.2;
const PACK_SIZE = 3.6;
/** Lo ancho de lo que separa dos placas (casillas): canales entre tempanos, grietas en la banquisa. */
const CHANNEL_WIDTH = 0.45;
const CRACK_WIDTH = 0.1;
/** Que parte del agua abierta lleva un trozo de hielo, y lo grande que es respecto a su celda. */
const CHUNK_SHARE = 0.3;
const CHUNK_RADIUS = 0.28;
/** Que parte de las placas es de hielo en sombra y cual va nevada (entera: con un circulo de nieve parecian huevos fritos). */
const SHADED_SHARE = 0.35;
const SNOWY_SHARE = 0.3;
/** Lo ancho del reborde de hielo al pie de la tierra (texels). */
const RIM_TEXELS = 2;
/** Hasta donde (casillas desde la tierra) titila la escarcha. */
const FROST_TILES = 18;

const ICE_COLORS = {
  water: 0x5a86c0,
  ice: 0xd4e9f6,
  iceShade: 0xbad7ee,
  snow: 0xf6fbff,
  crack: 0x6f98cc,
};

const FLOE_FUNCTIONS = /* glsl */ `
/**
 * Las placas de hielo: celdas de Voronoi de \`size\` casillas. x: distancia al centro mas cercano;
 * y: lo que le saca el segundo mas cercano (poco: cerca del borde de la placa); z: un numero de la placa.
 */
vec3 floeAt(vec2 point, float size) {
  vec2 cell = floor(point / size);
  float nearest = 1e9;
  float second = 1e9;
  float id = 0.0;
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 other = cell + vec2(float(dx), float(dy));
      vec2 center = (other + 0.15 + 0.7 * vec2(surfaceHash(other), surfaceHash(other + 31.0))) * size;
      float centerDistance = length(point - center);
      if (centerDistance < nearest) {
        second = nearest;
        nearest = centerDistance;
        id = surfaceHash(other + 7.0);
      } else {
        second = min(second, centerDistance);
      }
    }
  return vec3(nearest, second - nearest, id);
}
`;

const glslFloat = (value: number): string => value.toFixed(3);
const ICE_PAINT = /* glsl */ `
  float tileDistance = tilesFromLand(tile) + surfaceHash(tile) * ${glslFloat(RAGGED_TILES)};
  bool isOpenWater = tileDistance < ${glslFloat(OPEN_WATER_TILES)};
  bool isLoose = tileDistance < ${glslFloat(LOOSE_FLOE_TILES)};
  float size = isOpenWater ? ${glslFloat(CHUNK_SIZE)} : (isLoose ? ${glslFloat(FLOE_SIZE)} : ${glslFloat(PACK_SIZE)});
  vec3 floe = floeAt(texel, size);
  bool isChunk = floe.z < ${glslFloat(CHUNK_SHARE)} && floe.x < size * ${glslFloat(CHUNK_RADIUS)};
  bool isIce = isOpenWater ? isChunk : floe.y > (isLoose ? ${glslFloat(CHANNEL_WIDTH)} : ${glslFloat(CRACK_WIDTH)});
  vec3 between = isLoose ? uWater : uCrack;
  vec3 plate = floe.z < ${glslFloat(SHADED_SHARE)} ? uIceShade : (floe.z < ${glslFloat(1 - SNOWY_SHARE)} ? uIce : uSnow);
  diffuseColor.rgb = isIce ? plate : between;

  float sparkle = surfaceHash(floor(texel * ${TEXELS_GLSL}));
  float twinkle = step(fract(sparkle * 13.0 + uTime * 0.3), 0.3);
  float nearLand = step(tilesFromLand(texel), ${glslFloat(FROST_TILES)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow, float(isIce) * step(0.992, sparkle) * twinkle * nearLand);

  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow, step(tilesFromLand(texel), ${glslFloat(RIM_TEXELS / TEXELS_PER_TILE)}));
`;

export const ICE_SEA: SurfaceLook = { name: 'ice', colors: ICE_COLORS, paint: ICE_PAINT, functions: FLOE_FUNCTIONS };
