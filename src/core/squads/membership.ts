/** [CAMBIO] Quien esta en cada escuadra: formarlas, meter y sacar unidades, grupos por tecla, deshacerlas. */
import type { GameEvent, GameState, Squad, TeamId, Unit } from '../model';
import { cleanSquadName, freeKey, freeName, squadByKey } from './naming';
import { squadById, squadUnits } from './queries';
import { forUnit, liftStandingOrder, sameStandingOrder } from './standingOrders';

/** La escuadra tiene alguna unidad. */
const hasUnits = (s: GameState, squad: Squad): boolean => s.units.some((unit) => unit.squad === squad.id);

/**
 * Quita las escuadras que se han quedado sin unidades (las destruyen, se disuelven...) y lo cuenta:
 * un suceso 'squad' con `change: 'removed'` por cada una (sin actor: lo hace la partida). Es una de
 * las INVARIANTS.
 */
export function pruneSquads(s: GameState): GameEvent[] {
  if (!s.squads) return [];
  const removed = s.squads.filter((squad) => !hasUnits(s, squad));
  s.squads = s.squads.filter((squad) => hasUnits(s, squad));
  for (const unit of s.units) if (unit.squad !== undefined && !squadById(s, unit.squad)) delete unit.squad;
  if (!s.squads.length) delete s.squads;
  return removed.map((squad) => ({
    kind: 'squad',
    actor: null,
    squad: squad.id,
    change: 'removed',
    uids: [],
    name: squad.name,
    ...(squad.key !== undefined ? { key: squad.key } : {}),
  }));
}

/**
 * Forma una escuadra del equipo `team` con estas unidades suyas (salen de la que tuvieran; que son
 * del equipo lo comprueba la accion) y le da el primer nombre libre y la primera tecla libre del
 * equipo (o la tecla `key`, cuyo nombre de la lista prefiere: Ctrl+3 forma «Charlie»). Devuelve la
 * escuadra, o null si no hay unidades. Las escuadras que se quedan vacias al salir sus unidades se
 * quitan ya (no deben ocupar nombre, tecla ni numero), y sus sucesos van a `removed`.
 */
export function formSquad(
  s: GameState,
  team: TeamId,
  mine: readonly Unit[],
  name?: string,
  key?: number,
  removed: GameEvent[] = [],
): Squad | null {
  if (!mine.length) return null;
  for (const unit of mine) leaveSquad(s, unit);
  removed.push(...pruneSquads(s));
  const squads = s.squads ?? [];
  const id = squads.reduce((highest, squad) => Math.max(highest, squad.id), 0) + 1;
  const teamSquads = squads.filter((squad) => squad.team === team);
  const squadKey = key ?? freeKey(teamSquads);
  const squad: Squad = {
    id,
    team,
    name: (name && cleanSquadName(name)) || freeName(teamSquads, id, key),
    ...(squadKey !== undefined ? { key: squadKey } : {}),
  };
  for (const unit of mine) unit.squad = id;
  s.squads = [...squads, squad];
  liftStandingOrder(s, squad);
  return squad;
}

/**
 * [CAMBIO] Ctrl + numero: estas unidades del equipo (lo comprueba la accion) pasan a ser su grupo de
 * esa tecla. Si ya habia una escuadra con esa tecla, se queda solo con estas (las demas salen, con lo
 * que estaban haciendo); si no, se forma (ver formSquad, y `removed`). Devuelve la escuadra, o null
 * si no hay unidades.
 */
export function setGroup(s: GameState, team: TeamId, mine: readonly Unit[], key: number, removed: GameEvent[] = []): Squad | null {
  if (!mine.length) return null;
  const squad = squadByKey(s, team, key);
  if (!squad) return formSquad(s, team, mine, undefined, key, removed);
  const keep = new Set(mine.map((unit) => unit.uid));
  for (const unit of squadUnits(s, squad.id)) if (!keep.has(unit.uid)) leaveSquad(s, unit);
  return joinSquad(s, squad, mine);
}

/** [CAMBIO] Mayusculas + numero: añadir estas unidades del equipo al grupo de esa tecla (o formarlo). */
export function addToGroup(s: GameState, team: TeamId, mine: readonly Unit[], key: number, removed: GameEvent[] = []): Squad | null {
  if (!mine.length) return null;
  const squad = squadByKey(s, team, key);
  return squad ? joinSquad(s, squad, mine) : formSquad(s, team, mine, undefined, key, removed);
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

/** Deshace una escuadra: sus unidades siguen ahi (con lo que estuvieran haciendo), pero sueltas (la escuadra vacia la quita dispatch). */
export function disbandSquad(s: GameState, id: number): void {
  for (const unit of squadUnits(s, id)) leaveSquad(s, unit);
}
