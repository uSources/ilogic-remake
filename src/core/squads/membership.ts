/** [CAMBIO] Quien esta en cada escuadra: formarlas, meter y sacar unidades, grupos por tecla, deshacerlas. */
import type { GameState, Squad, TeamId, Unit } from '../model';
import { cleanSquadName, freeKey, freeName, squadByKey, squadsOfTeam } from './naming';
import { squadById, squadUnits, unitsOfTeam } from './queries';
import { forUnit, liftStandingOrder, sameStandingOrder } from './standingOrders';

/** Quita las escuadras que se han quedado sin unidades (las destruyen, se disuelven...). */
export function pruneSquads(s: GameState): void {
  if (!s.squads) return;
  s.squads = s.squads.filter((squad) => s.units.some((unit) => unit.squad === squad.id));
  for (const unit of s.units) if (unit.squad !== undefined && !squadById(s, unit.squad)) delete unit.squad;
  if (!s.squads.length) delete s.squads;
}

/**
 * Forma una escuadra del equipo `team` con estas unidades (solo las suyas; salen de la que tuvieran) y
 * le da el primer nombre libre y la primera tecla libre del equipo (o la tecla `key`, cuyo nombre de
 * la lista prefiere: Ctrl+3 forma «Charlie»). Devuelve la escuadra, o null si no hay unidades.
 */
export function formSquad(s: GameState, team: TeamId, units: readonly Unit[], name?: string, key?: number): Squad | null {
  const mine = unitsOfTeam(team, units);
  if (!mine.length) return null;
  for (const unit of mine) leaveSquad(s, unit);
  pruneSquads(s);
  const squads = s.squads ?? [];
  const id = squads.reduce((highest, squad) => Math.max(highest, squad.id), 0) + 1;
  const squadKey = key ?? freeKey(s, team);
  const squad: Squad = {
    id,
    team,
    name: (name && cleanSquadName(name)) || freeName(squadsOfTeam(s, team), id, key),
    ...(squadKey !== undefined ? { key: squadKey } : {}),
  };
  for (const unit of mine) unit.squad = id;
  s.squads = [...squads, squad];
  liftStandingOrder(s, squad);
  pruneSquads(s);
  return squad;
}

/**
 * [CAMBIO] Ctrl + numero: estas unidades (las del equipo) pasan a ser su grupo de esa tecla. Si ya habia una
 * escuadra con esa tecla, se queda solo con estas (las demas salen, con lo que estaban haciendo);
 * si no, se forma. Devuelve la escuadra, o null si no hay unidades.
 */
export function setGroup(s: GameState, team: TeamId, units: readonly Unit[], key: number): Squad | null {
  const mine = unitsOfTeam(team, units);
  if (!mine.length) return null;
  const squad = squadByKey(s, team, key);
  if (!squad) return formSquad(s, team, mine, undefined, key);
  const keep = new Set(mine.map((unit) => unit.uid));
  for (const unit of squadUnits(s, squad.id)) if (!keep.has(unit.uid)) leaveSquad(s, unit);
  return joinSquad(s, squad, mine);
}

/** [CAMBIO] Mayusculas + numero: añadir estas unidades al grupo de esa tecla (o formarlo). */
export function addToGroup(s: GameState, team: TeamId, units: readonly Unit[], key: number): Squad | null {
  const mine = unitsOfTeam(team, units);
  if (!mine.length) return null;
  const squad = squadByKey(s, team, key);
  return squad ? joinSquad(s, squad, mine) : formSquad(s, team, mine, undefined, key);
}

/** Meter unidades en una escuadra que ya existe (salen de la suya; las que no tenian orden siguen la de esta). */
function joinSquad(s: GameState, squad: Squad, units: readonly Unit[]): Squad {
  for (const unit of units) {
    if (unit.squad === squad.id) continue;
    leaveSquad(s, unit);
    unit.squad = squad.id;
    // Si ya hacia justo lo de la escuadra, la sigue (no va destacada).
    if (unit.standingOrder && squad.standingOrder && sameStandingOrder(unit.standingOrder, forUnit(s, unit, squad.standingOrder)))
      delete unit.standingOrder;
  }
  pruneSquads(s);
  return squad;
}

/** Saca la unidad de su escuadra; si seguia la orden de la escuadra, se la queda como propia. */
export function leaveSquad(s: GameState, unit: Unit): void {
  if (unit.squad === undefined) return;
  if (!unit.standingOrder) {
    const squadOrder = squadById(s, unit.squad)?.standingOrder;
    if (squadOrder) unit.standingOrder = forUnit(s, unit, squadOrder);
  }
  delete unit.squad;
}

/** Cambia el nombre de una escuadra. Devuelve false si no existe o el nombre queda vacio. */
export function renameSquad(s: GameState, id: number, name: string): boolean {
  const squad = squadById(s, id);
  const clean = cleanSquadName(name);
  if (!squad || !clean) return false;
  squad.name = clean;
  return true;
}

/** Deshace una escuadra: sus unidades siguen ahi (con lo que estuvieran haciendo), pero sueltas. */
export function disbandSquad(s: GameState, id: number): void {
  for (const unit of squadUnits(s, id)) leaveSquad(s, unit);
  pruneSquads(s);
}
