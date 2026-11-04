/** Por donde pasa cada tipo de movimiento y cuanto le cuesta, segun unas tablas de contenido. */
import type { ContentTables } from './tables';
import type { MoveType } from './types';

/** Ese tipo de movimiento puede pasar por ese terreno. */
export function walkableFor(tables: ContentTables, moveType: MoveType, terrain: number): boolean {
  return tables.CAN_WALK[moveType]?.[terrain] ?? false;
}

/** Lo que le cuesta a ese tipo de movimiento entrar en ese terreno (solo cuenta con la regla terrainCost). */
export function moveCostFor(tables: ContentTables, moveType: MoveType, terrain: number): number {
  return tables.MOVE_COST[moveType]?.[terrain] ?? 1;
}
