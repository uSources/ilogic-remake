/**
 * El menu de una unidad sale de las acciones: una opcion se ofrece si alguna de las acciones con las
 * que se cumpliria vale ahora (su `validate`). Asi el menu, la IA y dispatch no pueden decir cosas
 * distintas de lo que se puede hacer. Una opcion nueva es una entrada en UNIT_MENU.
 */
import { cargoUnits } from '../rules/queries';
import { unloadTiles } from '../rules/transport';
import { posOf } from '../geom';
import { isAlliedOwner } from '../teams';
import type { GameAction, GameState, Pos, StandingOrderKind, TeamId, Unit } from '../model';
import { isValidAction } from './dispatch';

/** Lo que se puede elegir en el menu de una unidad, en su orden. */
export type UnitMenuOption =
  'attack' | 'capture' | 'unload' | 'supply' | 'wait' | 'orderToAttack' | 'orderToCapture' | 'orderToDefend' | 'cancelOrder' | 'delete';

interface UnitMenuEntry {
  readonly id: UnitMenuOption;
  /** Las acciones con las que se cumpliria la opcion ahora (se ofrece si alguna vale). */
  candidates(s: GameState, unit: Unit): GameAction[];
}

/** Casillas en las que tendria sentido una orden de ese tipo: un edificio que no sea ya de la alianza, o donde esta. */
function orderTargets(s: GameState, team: TeamId, kind: StandingOrderKind, unit: Unit): Pos[] {
  if (kind !== 'capture') return [posOf(unit)];
  return s.buildings.filter((building) => !isAlliedOwner(s, building.owner, team)).map((building) => posOf(building));
}

/** Darle una orden de ese tipo (la casilla se elige despues): vale si hay alguna casilla en la que valdria. */
const orderEntry = (id: UnitMenuOption, kind: StandingOrderKind): UnitMenuEntry => ({
  id,
  candidates: (s, unit) =>
    orderTargets(s, unit.team, kind, unit).map((at) => ({ kind: 'giveStandingOrder', uids: [unit.uid], order: { kind, at } })),
});

/** Cada pasajero a cada casilla de al lado donde se le puede bajar. */
function unloadCandidates(s: GameState, transport: Unit): GameAction[] {
  return cargoUnits(s, transport).flatMap((passenger) =>
    unloadTiles(s, transport, passenger).map((to): GameAction => ({ kind: 'unload', uid: transport.uid, passenger: passenger.uid, to })),
  );
}

/** Las opciones del menu de una unidad, en su orden. */
export const UNIT_MENU: readonly UnitMenuEntry[] = [
  { id: 'attack', candidates: (s, unit) => s.units.map((target) => ({ kind: 'attack', uid: unit.uid, target: target.uid })) },
  { id: 'capture', candidates: (_s, unit) => [{ kind: 'capture', uid: unit.uid }] },
  { id: 'unload', candidates: unloadCandidates },
  { id: 'supply', candidates: (_s, unit) => [{ kind: 'supply', uid: unit.uid }] },
  { id: 'wait', candidates: (_s, unit) => [{ kind: 'wait', uid: unit.uid }] },
  // [CAMBIO] Ordenes con destino (se elige la casilla despues) y quitar la que tenga.
  orderEntry('orderToAttack', 'attack'),
  orderEntry('orderToCapture', 'capture'),
  orderEntry('orderToDefend', 'defend'),
  { id: 'cancelOrder', candidates: (_s, unit) => [{ kind: 'cancelStandingOrder', uids: [unit.uid] }] },
  { id: 'delete', candidates: (_s, unit) => [{ kind: 'deleteUnit', uid: unit.uid }] },
];

/** Lo que el equipo `team` puede hacer ahora con la unidad, en el orden del menu. */
export function availableActions(s: GameState, team: TeamId, unit: Unit): UnitMenuOption[] {
  const isAvailable = (entry: UnitMenuEntry) => entry.candidates(s, unit).some((action) => isValidAction(s, team, action));
  return UNIT_MENU.filter(isAvailable).map((entry) => entry.id);
}

/**
 * Se le puede dar ahora una orden de ese tipo a estas unidades del equipo: en `at` si se dice, o en
 * alguna casilla (la que se elegira despues) si no.
 */
export function canGiveStandingOrder(s: GameState, team: TeamId, units: readonly Unit[], kind: StandingOrderKind, at: Pos | null): boolean {
  const first = units[0];
  if (!first) return false;
  const uids = units.map((unit) => unit.uid);
  const targets = at ? [at] : orderTargets(s, team, kind, first);
  return targets.some((target) => isValidAction(s, team, { kind: 'giveStandingOrder', uids, order: { kind, at: target } }));
}
