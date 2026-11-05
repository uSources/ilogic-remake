/** Consultas sobre las escuadras: sus unidades y cual es cada una. Sin efectos; la base de las demas. */
import type { GameState, Squad, TeamId, Unit } from '../model';

/** Solo las de ese equipo: cada escuadra y cada orden con destino son de un equipo. */
export const unitsOfTeam = (team: TeamId, units: readonly Unit[]): Unit[] => units.filter((unit) => unit.team === team);

/** Unidades de una escuadra (las que caen se quitan de la partida: no hay que filtrarlas). */
export function squadUnits(s: GameState, id: number): Unit[] {
  return s.units.filter((unit) => unit.squad === id);
}

/** Escuadra por id. */
export function squadById(s: GameState, id: number | undefined): Squad | undefined {
  return id === undefined ? undefined : s.squads?.find((squad) => squad.id === id);
}
