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

/** La escuadra que forman exactamente estas unidades, todas y ninguna mas (o null). */
export function exactSquad(s: GameState, units: readonly Unit[]): Squad | null {
  const id = units[0]?.squad;
  if (id === undefined || !units.every((unit) => unit.squad === id)) return null;
  return squadUnits(s, id).length === units.length ? (squadById(s, id) ?? null) : null;
}
