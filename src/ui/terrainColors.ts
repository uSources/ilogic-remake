import { defaultContent } from '../core/content/default';

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
