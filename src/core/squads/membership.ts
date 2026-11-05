/** [CAMBIO] Quien esta en cada escuadra: formarlas, meter y sacar unidades, grupos por tecla, deshacerlas. */
import type { GameEvent, GameState, Squad, TeamId, Unit } from '../model';
import { cleanSquadName, freeKey, freeName, squadByKey } from './naming';
import { squadById, squadUnits } from './queries';
import { forUnit, liftStandingOrder, sameStandingOrder } from './standingOrders';

/** La escuadra tiene alguna unidad. */
const hasUnits = (s: GameState, squad: Squad): boolean => s.units.some((unit) => unit.squad === squad.id);

/** Al menos una unidad (formar o agrupar con ninguna no tiene sentido: la accion lo rechaza antes). */
export type SomeUnits = readonly [Unit, ...Unit[]];

/** Lo que deja formar o agrupar: la escuadra y las que se han quedado vacias y ya no existen. */
export interface SquadChangeResult {
  squad: Squad;
  removed: Squad[];
}

/**
 * Quita las escuadras que se han quedado sin unidades (las destruyen, se disuelven...). Devuelve
 * las quitadas. Es una de las INVARIANTS (que lo cuenta con 'removed').
 */
export function pruneSquads(s: GameState): Squad[] {
  if (!s.squads) return [];
  const removed = s.squads.filter((squad) => !hasUnits(s, squad));
  s.squads = s.squads.filter((squad) => hasUnits(s, squad));
  for (const unit of s.units) if (unit.squad !== undefined && !squadById(s, unit.squad)) delete unit.squad;
  if (!s.squads.length) delete s.squads;
  return removed;
}

/**
 * El suceso de una escuadra que ya no existe porque se ha quedado vacia (`actor`: el equipo cuya
 * accion la vacio, o null si la quita la partida). Ver SquadChange en model/events.ts.
 */
export function squadRemovedEvent(squad: Squad, actor: TeamId | null): GameEvent {
  return {
    kind: 'squad',
    actor,
    squad: squad.id,
    change: 'removed',
    uids: [],
    name: squad.name,
    ...(squad.key !== undefined ? { key: squad.key } : {}),
  };
}

/**
 * Forma una escuadra del equipo `team` con estas unidades suyas (salen de la que tuvieran; que son
 * del equipo lo comprueba la accion) y le da el primer nombre libre y la primera tecla libre del
 * equipo (o la tecla `key`, cuyo nombre de la lista prefiere: Ctrl+3 forma «Charlie») y el numero
 * siguiente (`nextSquadId`, que no se repite). Las escuadras que se quedan vacias al salir sus
 * unidades se quitan antes (no deben ocupar nombre ni tecla): van en `removed`.
 */
export function formSquad(s: GameState, team: TeamId, mine: SomeUnits, name?: string, key?: number): SquadChangeResult {
  for (const unit of mine) leaveSquad(s, unit);
  const removed = pruneSquads(s);
  const squads = s.squads ?? [];
  const id = s.nextSquadId++;
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
  return { squad, removed };
}

/**
 * [CAMBIO] Ctrl + numero: estas unidades del equipo (lo comprueba la accion) pasan a ser su grupo de
 * esa tecla. Si ya habia una escuadra con esa tecla, se queda solo con estas (las demas salen, con lo
 * que estaban haciendo); si no, se forma (ver formSquad).
 */
export function setGroup(s: GameState, team: TeamId, mine: SomeUnits, key: number): SquadChangeResult {
  const squad = squadByKey(s, team, key);
  if (!squad) return formSquad(s, team, mine, undefined, key);
  const keep = new Set(mine.map((unit) => unit.uid));
  for (const unit of squadUnits(s, squad.id)) if (!keep.has(unit.uid)) leaveSquad(s, unit);
  return joinSquad(s, squad, mine);
}

/** [CAMBIO] Mayusculas + numero: añadir estas unidades del equipo al grupo de esa tecla (o formarlo). */
export function addToGroup(s: GameState, team: TeamId, mine: SomeUnits, key: number): SquadChangeResult {
  const squad = squadByKey(s, team, key);
  return squad ? joinSquad(s, squad, mine) : formSquad(s, team, mine, undefined, key);
}

/** Meter unidades en una escuadra que ya existe (salen de la suya; las que no tenian orden siguen la de esta). */
function joinSquad(s: GameState, squad: Squad, units: readonly Unit[]): SquadChangeResult {
  for (const unit of units) {
    if (unit.squad === squad.id) continue;
    leaveSquad(s, unit);
    unit.squad = squad.id;
    // Si ya hacia justo lo de la escuadra, la sigue (no va destacada).
    if (unit.standingOrder && squad.standingOrder && sameStandingOrder(unit.standingOrder, forUnit(s, unit, squad.standingOrder)))
      delete unit.standingOrder;
  }
  return { squad, removed: pruneSquads(s) };
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

/** Cambia el nombre de una escuadra (si el nombre limpio queda vacio, no cambia: lo rechaza la accion). */
export function renameSquad(squad: Squad, name: string): void {
  const clean = cleanSquadName(name);
  if (clean) squad.name = clean;
}

/**
 * Deshace una escuadra: sus unidades siguen ahi (con lo que estuvieran haciendo), pero sueltas, y la
 * escuadra deja de existir ya (su suceso es 'disbanded', sin un 'removed' detras).
 */
export function disbandSquad(s: GameState, squad: Squad): void {
  for (const unit of squadUnits(s, squad.id)) leaveSquad(s, unit);
  pruneSquads(s);
}
