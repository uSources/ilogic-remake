import { defaultContent } from '../core/content/default';
import { terrainAt, themeOf } from '../core/gameContent';
import type { GameState, Pos } from '../core/model';

/** Color de cada terreno en el minimapa y las miniaturas, por id de terreno (terrain.json). */
export type TerrainPalette = Readonly<Record<string, number>>;

/**
 * El color de cada terreno para minimapas y miniaturas: el de su "mapColor" (terrain.json), el que
 * tiene en el tablero 3D. Antes era el color medio de su imagen del 2D, y las montañas y el bosque
 * apenas se distinguian de la hierba.
 */
export function terrainPalette(): TerrainPalette {
  return Object.fromEntries(defaultContent().terrain.list.map((terrain) => [terrain.id, terrain.mapColor]));
}

/** Color de una casilla cuyo terreno no esta en la paleta. */
const FALLBACK_TERRAIN = 0x3a7a3a;

/**
 * El color de una casilla en el minimapa y las miniaturas: el que le da el tema de la partida si lo
 * cambia (themes.json "mapColors": el agua turbia del pantano) y, si no, el de su terreno en la paleta.
 */
export function tileMapColor(palette: TerrainPalette, s: GameState, pos: Pos): number {
  const terrain = terrainAt(s, pos).id;
  const themed = themeOf(s).mapColors?.[terrain];
  return themed ? Number.parseInt(themed.slice(1), 16) : (palette[terrain] ?? FALLBACK_TERRAIN);
}
