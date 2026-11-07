/**
 * Lo que comparten los pasos del generador de mapas: sus numeros (mapgen.json, los de la partida) y
 * como mide la tierra.
 */
import { entryOf, type MoveType, type MapgenSettings, type TerrainType } from '../content';
import { canMoveOn } from '../rules/queries';
import type { GridSize } from '../util/grid';
import type { GameState } from '../model';

/** Lado del mapa del original, con el que estan medidos los numeros de mapgen.json. */
export const ORIGINAL_MAP_SIDE = 32;
/** Distancia minima entre dos bases en un mapa de 32; se escala con el lado del mapa. */
export const MIN_SPAWN_DISTANCE = 14;
/** Intentos con poca tierra que se descartan; a partir de ahi vale cualquier mapa. */
export const MAX_ATTEMPTS_FOR_LAND = 500;
/** Intentos de elegir la casilla de un edificio inicial antes de quedarse con la primera libre. */
export const BUILDING_PICK_TRIES = 100;

/** Superficie del mapa respecto al original de 32x32 (para escalar cuantos edificios hay). */
export const areaScale = (size: GridSize) => (size.width * size.height) / (ORIGINAL_MAP_SIDE * ORIGINAL_MAP_SIDE);

/** Los numeros del generador del contenido de la partida (mapgen.json). */
export const settingsOf = (s: GameState): MapgenSettings => s.content.mapgen;

/** Lo que pisa a pie el generador (mapgen.json, "landMovement"): las salidas y la tierra se miden con el. */
export const landMovementOf = (s: GameState): MoveType => settingsOf(s).landMovement;
export const isWalkable = (s: GameState, terrain: TerrainType) => canMoveOn(landMovementOf(s), terrain);
/** El terreno de un id de themes.json (validado al cargar el contenido). */
export const terrainNamed = (s: GameState, id: string): TerrainType => entryOf(s.content.terrain, id, 'terreno');
