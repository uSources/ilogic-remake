/** Consultas sobre las escuadras: sus unidades y cual es cada una. Sin efectos; la base de las demas. */
import { isPlayer } from '../util/predicates';
import type { GameState, Squad, Unit } from '../model';

/** Solo las del jugador: las escuadras y las ordenes con destino son suyas (la IA decide sola). */
export const playerUnits = (units: readonly Unit[]): Unit[] => units.filter((unit) => isPlayer(unit.team));

/** Unidades vivas de una escuadra. */
export function squadUnits(s: GameState, id: number): Unit[] {
  return s.units.filter((unit) => unit.squad === id);
}

/** Escuadra por id. */
export function squadById(s: GameState, id: number | undefined): Squad | undefined {
  return id === undefined ? undefined : s.squads?.find((squad) => squad.id === id);
}
