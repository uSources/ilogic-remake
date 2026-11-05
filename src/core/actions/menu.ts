/**
 * Los menus salen de las acciones: una opcion se ofrece si alguna de las acciones con las que se
 * cumpliria vale ahora (su `validate`). Asi los menus, los mandos, la IA y dispatch no pueden decir
 * cosas distintas de lo que se puede hacer. Dos listas: UNIT_MENU, el menu de la unidad que se acaba
 * de mover (`availableActions`), y SELECTION_MENU, lo que se puede mandar a unas unidades elegidas
 * (un grupo, o una desde la bandeja: `canDoWithSelection`). Una opcion nueva es una entrada en una
 * de las dos; lo que solo es de la interfaz (si hay un enemigo a la vista en la casilla, que formar
 * escuadra pide dos o mas) lo añaden los mandos (controls/actions.ts).
 */
import { cargoUnits } from '../rules/queries';
import { moveRange } from '../rules/movement';
import { unloadTiles } from '../rules/transport';
import { posOf } from '../geom';
import { exactSquad, squadById } from '../squads/queries';
import { closestStep } from '../targeting';
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

const uidsOf = (units: readonly Unit[]): number[] => units.map((unit) => unit.uid);

/** Darles una orden de ese tipo en `at`, o (sin casilla, se elige despues) en cualquiera en la que valdria. */
function orderCandidates(s: GameState, team: TeamId, units: readonly Unit[], kind: StandingOrderKind, at: Pos | null): GameAction[] {
  const first = units[0];
  if (!first) return [];
  const targets = at ? [at] : orderTargets(s, team, kind, first);
  return targets.map((target) => ({ kind: 'giveStandingOrder', uids: uidsOf(units), order: { kind, at: posOf(target) } }));
}

/** Darle una orden de ese tipo (la casilla se elige despues): vale si hay alguna casilla en la que valdria. */
const orderEntry = (id: UnitMenuOption, kind: StandingOrderKind): UnitMenuEntry => ({
  id,
  candidates: (s, unit) => orderCandidates(s, unit.team, [unit], kind, null),
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
  return orderCandidates(s, team, units, kind, at).some((action) => isValidAction(s, team, action));
}

/** Lo que se puede mandar a unas unidades elegidas, en una casilla `at` o (null) sin ella. */
export type SelectionOption =
  | 'attack'
  | 'capture'
  | 'move'
  | 'orderToAttack'
  | 'orderToCapture'
  | 'orderToDefend'
  | 'cancelOrder'
  | 'squadForm'
  | 'squadLeave'
  | 'squadRename'
  | 'squadDisband';

/** Las acciones con las que se cumpliria la opcion con estas unidades (se puede si alguna vale). */
type SelectionCandidates = (s: GameState, team: TeamId, units: readonly Unit[], at: Pos | null) => GameAction[];

/** Cada una va lo mas cerca que pueda de `at` (como al mover el grupo): vale si alguna puede dar un paso. */
function groupMoveCandidates(s: GameState, units: readonly Unit[], at: Pos | null): GameAction[] {
  if (!at) return [];
  return units.flatMap((unit): GameAction[] => {
    const step = closestStep(unit, at, moveRange(s, unit));
    return step ? [{ kind: 'move', uid: unit.uid, to: step }] : [];
  });
}

/** Una accion sobre la escuadra que forman justo estas unidades (ninguna si no forman una entera). */
const onExactSquad =
  (action: (squad: number, name: string) => GameAction): SelectionCandidates =>
  (s, _team, units) => {
    const squad = squadById(s, exactSquad(s, units) ?? undefined);
    return squad ? [action(squad.id, squad.name)] : [];
  };

export const SELECTION_MENU: { readonly [Option in SelectionOption]: SelectionCandidates } = {
  // Un grupo ataca o captura recibiendo la orden en esa casilla (y empezandola ya).
  attack: (s, team, units, at) => (at ? orderCandidates(s, team, units, 'attack', at) : []),
  capture: (s, team, units, at) => (at ? orderCandidates(s, team, units, 'capture', at) : []),
  move: (s, _team, units, at) => groupMoveCandidates(s, units, at),
  orderToAttack: (s, team, units, at) => orderCandidates(s, team, units, 'attack', at),
  orderToCapture: (s, team, units, at) => orderCandidates(s, team, units, 'capture', at),
  orderToDefend: (s, team, units, at) => orderCandidates(s, team, units, 'defend', at),
  cancelOrder: (_s, _team, units) => [{ kind: 'cancelStandingOrder', uids: uidsOf(units) }],
  squadForm: (_s, _team, units) => [{ kind: 'formSquad', uids: uidsOf(units) }],
  squadLeave: (_s, _team, units) => [{ kind: 'leaveSquad', uids: uidsOf(units) }],
  squadRename: onExactSquad((squad, name) => ({ kind: 'renameSquad', squad, name })),
  squadDisband: onExactSquad((squad) => ({ kind: 'disbandSquad', squad })),
};

/** El equipo `team` puede mandar ahora esa opcion a estas unidades (en `at`, o sin casilla). */
export function canDoWithSelection(s: GameState, team: TeamId, units: readonly Unit[], option: SelectionOption, at: Pos | null): boolean {
  return SELECTION_MENU[option](s, team, units, at).some((action) => isValidAction(s, team, action));
}
