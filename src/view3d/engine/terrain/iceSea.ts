/**
 * El mar helado del nevado (un aspecto del suelo de alrededor, surface.ts). Cambia con la distancia a
 * la tierra: pegado a la orilla, agua abierta con trozos de hielo sueltos (enlaza con el agua del
 * tablero y hace que destaque su borde); luego, tempanos separados por canales de agua; y lejos, la
 * banquisa, placas juntas con grietas finas. Las placas son celdas de Voronoi en texels, todas de la
 * misma rejilla, y cada una entera: su franja la decide su centro (no la casilla), porque una placa
 * cortada por el borde de una casilla se veia rota, a escalones y rectangulos. La banquisa junta las
 * placas vecinas de un mismo grupo en otras mas grandes (sin grieta entre ellas). Cada placa es de un
 * tono (hielo, hielo en sombra o nevada); al pie de la tierra queda un reborde de hielo blanco y sobre
 * el hielo titila la escarcha.
 */
import { glslFloat, type SurfaceLook, TEXELS_GLSL, TEXELS_PER_TILE } from './surface';

/** Lo que mide cada placa (casillas) y cada grupo de placas que se juntan en la banquisa. */
const FLOE_SIZE = 2.2;
const PACK_GROUP_SIZE = 3.6;
/**
 * Hasta cuantas casillas de la tierra (desde su centro) una placa es agua abierta y hasta cuantas un
 * tempano suelto (luego, banquisa). Medido desde el centro, el agua abierta tiene que llegar mas lejos
 * que lo que mide media placa: si no, los tempanos tocan la tierra.
 */
const OPEN_WATER_TILES = 3;
const LOOSE_FLOE_TILES = 8;
/** Cuanto se mella, placa a placa, el paso de una franja a la siguiente (casillas). */
const RAGGED_TILES = 1.6;
/** Lo ancho de lo que separa dos placas (casillas): canales entre tempanos, grietas en la banquisa. */
const CHANNEL_WIDTH = 0.45;
const CRACK_WIDTH = 0.1;
/**
 * Que parte de las placas del agua abierta lleva un trozo de hielo en su centro, y su radio (casillas).
 * Si su centro queda tan cerca de la tierra que no cabe, no hay trozo (saldria cortado por el borde).
 */
const CHUNK_SHARE = 0.6;
const CHUNK_RADIUS = 0.3;
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
/** El centro de la placa de la celda \`floe\` de la rejilla de placas (en casillas). */
vec2 floeCenter(vec2 floe) {
  return (floe + 0.15 + 0.7 * vec2(surfaceHash(floe), surfaceHash(floe + 31.0))) * ${glslFloat(FLOE_SIZE)};
}

/** El grupo en la banquisa de la placa de centro \`center\`: las de un mismo grupo se juntan en una placa grande. */
vec2 packGroup(vec2 center) {
  return floor(center / ${glslFloat(PACK_GROUP_SIZE)});
}

/** La celda de la placa mas cercana a \`point\` (sus vecinas, en las 3x3 celdas de alrededor). */
vec2 nearestFloe(vec2 point) {
  vec2 home = floor(point / ${glslFloat(FLOE_SIZE)});
  vec2 nearest = home;
  float nearestDistance = 1e9;
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 floe = home + vec2(float(dx), float(dy));
      float centerDistance = length(point - floeCenter(floe));
      if (centerDistance < nearestDistance) {
        nearestDistance = centerDistance;
        nearest = floe;
      }
    }
  return nearest;
}

/**
 * Lo que le saca a \`point\` la placa vecina mas cercana que no se junta con la suya, \`floe\` (poco:
 * cerca del borde de su placa). Un tempano no se junta con ninguna; en la banquisa, con las de su grupo.
 */
float gapToNeighbor(vec2 point, vec2 floe, bool isPack) {
  vec2 home = floor(point / ${glslFloat(FLOE_SIZE)});
  vec2 ownCenter = floeCenter(floe);
  vec2 group = packGroup(ownCenter);
  float neighborDistance = 1e9;
  for (int dx = -1; dx <= 1; dx++)
    for (int dy = -1; dy <= 1; dy++) {
      vec2 neighbor = home + vec2(float(dx), float(dy));
      vec2 center = floeCenter(neighbor);
      bool isJoined = neighbor == floe || (isPack && packGroup(center) == group);
      if (!isJoined) neighborDistance = min(neighborDistance, length(point - center));
    }
  return neighborDistance - length(point - ownCenter);
}
`;

const ICE_PAINT = /* glsl */ `
  vec2 floe = nearestFloe(texel);
  vec2 floeMiddle = floeCenter(floe);
  float centerLand = tilesFromLand(floeMiddle);
  float floeLand = centerLand + surfaceHash(floe + 13.0) * ${glslFloat(RAGGED_TILES)};
  bool isOpenWater = floeLand < ${glslFloat(OPEN_WATER_TILES)};
  bool isPack = floeLand >= ${glslFloat(LOOSE_FLOE_TILES)};
  float tone = surfaceHash((isPack ? packGroup(floeMiddle) : floe) + 7.0);
  bool hasChunk = surfaceHash(floe + 19.0) < ${glslFloat(CHUNK_SHARE)} && centerLand > ${glslFloat(CHUNK_RADIUS)};
  bool isChunk = hasChunk && length(texel - floeMiddle) < ${glslFloat(CHUNK_RADIUS)};
  bool isPlate = gapToNeighbor(texel, floe, isPack) > (isPack ? ${glslFloat(CRACK_WIDTH)} : ${glslFloat(CHANNEL_WIDTH)});
  bool isIce = isOpenWater ? isChunk : isPlate;
  vec3 between = isPack ? uCrack : uWater;
  vec3 plate = tone < ${glslFloat(SHADED_SHARE)} ? uIceShade : (tone < ${glslFloat(1 - SNOWY_SHARE)} ? uIce : uSnow);
  diffuseColor.rgb = isIce ? plate : between;

  float sparkle = surfaceHash(floor(texel * ${TEXELS_GLSL}));
  float twinkle = step(fract(sparkle * 13.0 + uTime * 0.3), 0.3);
  float nearLand = step(texelDistance, ${glslFloat(FROST_TILES)});
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow, float(isIce) * step(0.992, sparkle) * twinkle * nearLand);

  diffuseColor.rgb = mix(diffuseColor.rgb, uSnow, step(texelDistance, ${glslFloat(RIM_TEXELS / TEXELS_PER_TILE)}));
`;

export const ICE_SEA: SurfaceLook = { name: 'ice', colors: ICE_COLORS, paint: ICE_PAINT, functions: FLOE_FUNCTIONS };
