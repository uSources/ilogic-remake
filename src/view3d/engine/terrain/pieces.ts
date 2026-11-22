/**
 * Que lleva cada terreno en 3D (por id de terrain.json): el bloque de su casilla, el decorado de encima,
 * si es relieve y lo que vive en ella (las motas que vuelan y los animalitos del decorado, engine/life/).
 * Cada tema puede cambiar los suyos (`THEME_PIECES`): el nevado tiene sus montañas y el pantano, todo lo
 * suyo (suelo oliva con charcos, agua turbia con nenufares, cipreses con musgo, juncos y ranas). Un
 * terreno sin entrada se ve segun lo que es (agua, esconde, llano), asi cualquier contenido se puede mirar.
 */
import type { TerrainType } from '../../../core/content';
import { terrainAt, themeOf } from '../../../core/gameContent';
import type { GameState, Pos } from '../../../core/model';
import type { CritterSeat } from '../life/critters';
import { FIREFLIES, FROG, SAND_DUST } from '../life/kinds';
import type { MoteKind } from '../life/motes';
import type { ReliefStyle } from './relief';
import { type BankColors, CLEAR_WATER, MURKY_WATER, type WaterLook } from './water';

/** Las casillas de Ashfox y la altura de su cara de arriba (en unidades de Ashfox: 16 = una casilla). */
const TILE_TOPS = {
  tile_grass: 4,
  tile_forest: 4,
  tile_sand: 4,
  tile_snow: 4,
  tile_marsh: 4,
  tile_bog: 4,
  tile_water: 1,
  tile_deep: 0,
  tile_shallow: 2,
  tile_ice: 2,
  tile_swamp_water: 1,
  tile_swamp_deep: 0,
  tile_swamp_shallow: 2,
} as const;
export type TileModel = keyof typeof TILE_TOPS;
const ASHFOX_UNITS_PER_TILE = 16;

export const tileTop = (tile: TileModel): number => TILE_TOPS[tile] / ASHFOX_UNITS_PER_TILE;

/** Las casillas de agua que se mueven (el hielo no) y el color de sus brillos y su espuma. */
export const WATER_LOOKS: Readonly<Partial<Record<TileModel, WaterLook>>> = {
  tile_water: CLEAR_WATER,
  tile_deep: CLEAR_WATER,
  tile_shallow: CLEAR_WATER,
  tile_swamp_water: MURKY_WATER,
  tile_swamp_deep: MURKY_WATER,
  tile_swamp_shallow: MURKY_WATER,
};

export interface TerrainPiece {
  tile: TileModel;
  /** El decorado de encima; con varios, cada casilla elige uno (siempre el mismo). */
  decor?: readonly string[];
  /** Que parte de las casillas lleva decorado (sin decir, todas): asi no hay un nenufar en cada charco. */
  decorShare?: number;
  /**
   * Si es relieve (montaña, meseta, dunas): su estilo. Se dibuja el relieve en vez de la casilla
   * (`tile` sigue diciendo de que suelo es), y lo que hay encima se pone en lo alto, como en 2D.
   */
  relief?: ReliefStyle;
  /** Las motas que vuelan por encima (life/kinds.ts: el polvo, las luciernagas). */
  motes?: readonly MoteKind[];
  /** Los animalitos que se sientan en su decorado, y donde (life/kinds.ts: las ranas). */
  critters?: readonly CritterSeat[];
}

/**
 * Los relieves, con sus colores por alturas y la roca
 * de sus laderas empinadas: hierba en las faldas, monte bajo, roca y nieve en las cimas mas altas.
 */
const GREEN_MOUNTAIN: ReliefStyle = {
  shape: 'peak',
  bands: [
    { from: 0, color: 0x6fae3c },
    { from: 0.3, color: 0x5c9c38 },
    { from: 0.55, color: 0x4a8532 },
    { from: 0.85, color: 0x8c8676 },
    { from: 1.2, color: 0xa8a290 },
    { from: 1.5, color: 0xf2f6ff },
  ],
  cliff: 0x77715f,
};
/** La del pantano: faldas oliva como su suelo, monte bajo oscuro y roca gris verdosa. */
const SWAMP_MOUNTAIN: ReliefStyle = {
  shape: 'peak',
  bands: [
    { from: 0, color: 0x68863a },
    { from: 0.3, color: 0x587630 },
    { from: 0.55, color: 0x4a6428 },
    { from: 0.85, color: 0x7a7662 },
    { from: 1.2, color: 0x948f7a },
    { from: 1.5, color: 0xe2e8dc },
  ],
  cliff: 0x6a6654,
};
const SNOW_MOUNTAIN: ReliefStyle = {
  shape: 'peak',
  bands: [
    { from: 0, color: 0xdce8f4 },
    { from: 0.3, color: 0x7f8ea6 },
    { from: 0.75, color: 0x9eacc2 },
    { from: 1.15, color: 0xf4f8ff },
  ],
  cliff: 0x667590,
};
/** La meseta, a capas de roca de colores (como los estratos de un cañon). Tambien la de los cerros del desierto (surroundings.ts). */
export const MESA: ReliefStyle = {
  shape: 'mesa',
  bands: [
    { from: 0, color: 0xe3ac55 },
    { from: 0.12, color: 0xd0712c },
    { from: 0.37, color: 0xee9a48 },
    { from: 0.62, color: 0xc0602a },
    { from: 0.87, color: 0xf0b060 },
    { from: 1.12, color: 0xb4542a },
  ],
};
const DUNES: ReliefStyle = {
  shape: 'dunes',
  bands: [
    { from: 0, color: 0xe3ac55 },
    { from: 0.05, color: 0xf2c66e },
    { from: 0.11, color: 0xffe2a0 },
  ],
};

const GRASS: TerrainPiece = { tile: 'tile_grass' };
const WATER: TerrainPiece = { tile: 'tile_water' };
const WOODS: TerrainPiece = { tile: 'tile_forest', decor: ['trees'] };

export const TERRAIN_PIECES: Readonly<Record<string, TerrainPiece>> = {
  Grass: GRASS,
  Flowers: { tile: 'tile_grass', decor: ['flowers_red', 'flowers_yellow', 'flowers_purple', 'flowers_mixed'] },
  Woods: WOODS,
  GrassMountain: { tile: 'tile_grass', relief: GREEN_MOUNTAIN },
  Water: WATER,
  SWater: { tile: 'tile_shallow' },
  DWater: { tile: 'tile_deep' },
  Sand: { tile: 'tile_sand', relief: DUNES, motes: [SAND_DUST] },
  Cactus: { tile: 'tile_sand', relief: DUNES, decor: ['cactus'], motes: [SAND_DUST] },
  SandMountain: { tile: 'tile_sand', relief: MESA, motes: [SAND_DUST] },
  Snow: { tile: 'tile_snow' },
  Frosty: { tile: 'tile_snow', decor: ['snowman'] },
  SnowMountain: { tile: 'tile_snow', relief: SNOW_MOUNTAIN },
  SnowWood: { tile: 'tile_snow', decor: ['pines'] },
  Ice: { tile: 'tile_ice' },
};

/** Donde se sientan las ranas: en el nenufar grande del centro o en el hueco de la esquina de los juncos (modelos a 32 por casilla). */
const ON_THE_LILY_PAD: CritterSeat = { kind: FROG, share: 0.3, at: [0, 1 / 32, 0] };
const IN_THE_REEDS: CritterSeat = { kind: FROG, share: 0.3, at: [0.25, 0, 0.25] };

/** El pantano: nada se parece al bosque. Los arboles, el agua, los juncos y lo que vive ahi son suyos. */
const SWAMP_PIECES: Readonly<Record<string, TerrainPiece>> = {
  Grass: { tile: 'tile_marsh', decor: ['reeds'], decorShare: 0.18, critters: [IN_THE_REEDS] },
  Flowers: { tile: 'tile_marsh', decor: ['cattails'], critters: [IN_THE_REEDS], motes: [FIREFLIES] },
  Woods: { tile: 'tile_bog', decor: ['swamp_trees_0', 'swamp_trees_1'], motes: [FIREFLIES] },
  GrassMountain: { tile: 'tile_marsh', relief: SWAMP_MOUNTAIN },
  Water: {
    tile: 'tile_swamp_water',
    decor: ['lilies_0', 'lilies_1', 'lilies_2'],
    decorShare: 0.5,
    critters: [ON_THE_LILY_PAD],
    motes: [FIREFLIES],
  },
  SWater: { tile: 'tile_swamp_shallow', decor: ['reeds'], decorShare: 0.4 },
  DWater: { tile: 'tile_swamp_deep' },
};

/**
 * La tierra que sujeta el agua en el borde del mapa (water.ts), por tema: la del lateral de sus
 * casillas de tierra (los PAINTS de tools/art/ashfox/models/terrain.mjs: tierra, roca helada, barro)
 * o, en el desierto, la arena del pie de sus dunas.
 */
const EARTH_BANK: BankColors = { shade: 0x5a3420, middle: 0x8a5530, light: 0xb47a45 };
const BANKS_BY_THEME: Readonly<Record<string, BankColors>> = {
  Snowy: { shade: 0x2c4c7c, middle: 0x4a72a8, light: 0x7aa2d6 },
  Swamp: { shade: 0x3e2e20, middle: 0x54402c, light: 0x6a5238 },
  Desert: { shade: 0xc8923f, middle: 0xe3ac55, light: 0xf2c66e },
};
export const bankOf = (s: GameState): BankColors => BANKS_BY_THEME[themeOf(s).id] ?? EARTH_BANK;

/** Lo que cambia cada tema (id de themes.json): en el nevado, las montañas de hierba son nevadas (como en 2D). */
export const THEME_PIECES: Readonly<Record<string, Readonly<Record<string, TerrainPiece>>>> = {
  Snowy: { GrassMountain: { tile: 'tile_snow', relief: SNOW_MOUNTAIN } },
  Swamp: SWAMP_PIECES,
};

/**
 * Cuantas variantes tiene cada suelo (`<casilla>_<n>`: los mismos colores con otros detalles, ver
 * tools/art/ashfox/models/terrain.mjs). Cada casilla elige una y un giro: asi no se ven todas iguales.
 */
const TILE_VARIANTS: Readonly<Partial<Record<TileModel, number>>> = {
  tile_grass: 4,
  tile_forest: 3,
  tile_snow: 3,
  tile_marsh: 3,
  tile_bog: 3,
};

export const variantFiles = (tile: TileModel): string[] => {
  const count = TILE_VARIANTS[tile];
  return count ? Array.from({ length: count }, (_, index) => `${tile}_${index}`) : [tile];
};

const ALL_PIECES = [...Object.values(TERRAIN_PIECES), ...Object.values(THEME_PIECES).flatMap((pieces) => Object.values(pieces))];

/** Los modelos de una pieza: su casilla (si no es relieve), sus decorados y sus animales. */
const modelsOf = (piece: TerrainPiece): string[] => [
  ...(piece.relief ? [] : variantFiles(piece.tile)),
  ...(piece.decor ?? []),
  ...(piece.critters ?? []).map((seat) => seat.kind.model),
];

/** Los modelos que hay que cargar (rutas dentro de assets/models). */
export const TERRAIN_MODEL_FILES: readonly string[] = [...new Set(ALL_PIECES.flatMap(modelsOf))].map((model) => `terrain/${model}`);

/** Lo que no tiene pieza propia se ve como lo que es. */
function fallbackPiece(terrain: TerrainType): TerrainPiece {
  if (terrain.isWater) return WATER;
  return terrain.hides ? WOODS : GRASS;
}

export function pieceAt(s: GameState, pos: Pos): TerrainPiece {
  const terrain = terrainAt(s, pos);
  return THEME_PIECES[themeOf(s).id]?.[terrain.id] ?? TERRAIN_PIECES[terrain.id] ?? fallbackPiece(terrain);
}
