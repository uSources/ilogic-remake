/**
 * Las letras del mapa de la partida por texto (`textLetter` de terrain.json y buildings.json): en una
 * casilla sale la letra de su terreno o la de su edificio (en minuscula si es de otro equipo), asi que
 * ninguna letra de un terreno puede ser la de un edificio, ni en mayuscula ni en minuscula.
 */
import type { Checker } from './check';
import type { BuildingDef, TerrainDef } from './types';

export function validateTextLetters(terrain: readonly TerrainDef[], buildings: readonly BuildingDef[], check: Checker): void {
  const buildingByLetter = new Map(buildings.map((building) => [building?.textLetter?.toLowerCase(), building?.id]));
  for (const type of terrain) {
    const building = buildingByLetter.get(type?.textLetter?.toLowerCase());
    check
      .scope(`terreno ${type?.id}`)
      .expect(
        building === undefined,
        `textLetter "${type?.textLetter}" se confunde en el mapa con el edificio ${building} (de otro equipo sale en minuscula)`,
      );
  }
}
