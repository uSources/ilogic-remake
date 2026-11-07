/**
 * [CAMBIO] Que orden permanente cumple cada unidad (la suya propia, destacada, o la de su escuadra,
 * adaptada) y si se puede dar una: lo que preguntan la escena y quien las cumple (la partida para
 * todos los equipos, autopilot/standingOrders.ts). Solo miran: los pasos que las cambian estan en
 * standingOrderSteps.ts.
 */
import { manhattan, samePos, posOf } from '../geom';
import { teamUnits } from '../rules/queries';
import { isAlive } from '../util/predicates';
import type { GameState, Pos, Squad, StandingOrder, StandingOrderKind, StandingOrderMoment, TeamId, TurnEndOrder, Unit } from '../model';
import { squadById, squadUnits } from './queries';
import { isTurnEndOrder, momentOf, STANDING_ORDER_KINDS, STANDING_ORDER_TYPES, type StandingOrderBlock } from './standingOrderTypes';

export const sameStandingOrder = (first: StandingOrder, second: StandingOrder): boolean =>
  first.kind === second.kind && samePos(first.at, second.at);

export const copyStandingOrder = <Order extends StandingOrder>(standingOrder: Order): Order => ({
  ...standingOrder,
  at: posOf(standingOrder.at),
});

/** La orden tal como la cumple esta unidad: la que no puede cumplirla va de escolta (`escort`: con capturar, atacar). */
export function forUnit<Order extends StandingOrder>(s: GameState, unit: Unit, standingOrder: Order): Order {
  const escort = STANDING_ORDER_TYPES[standingOrder.kind].escort;
  const kind = escort && !escort.canFulfil(s, unit) ? escort.as : standingOrder.kind;
  return { ...copyStandingOrder(standingOrder), kind };
}

/**
 * [CAMBIO] La orden que cumple la unidad: la suya propia si la tiene (destacada) y si no la de su
 * escuadra (adaptada: escolta en una captura). undefined = no tiene orden.
 */
export function effectiveStandingOrder(s: GameState, unit: Unit): StandingOrder | undefined {
  if (unit.standingOrder) return unit.standingOrder;
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return squadOrder ? forUnit(s, unit, squadOrder) : undefined;
}

/** La orden que cumple la unidad en ese momento de su turno (`momentOf`), si la tiene. */
export function standingOrderAt(s: GameState, unit: Unit, moment: StandingOrderMoment): StandingOrder | undefined {
  const order = effectiveStandingOrder(s, unit);
  return order && momentOf(order.kind) === moment ? order : undefined;
}

/** La orden de pelear (atacar, capturar, defender) que cumple al acabar el turno: la que se enseña como orden. */
export function turnEndOrderOf(s: GameState, unit: Unit): TurnEndOrder | undefined {
  const order = effectiveStandingOrder(s, unit);
  return order && isTurnEndOrder(order) ? order : undefined;
}

/** A donde va con su orden de viaje (la que `travels`: ir alli), si la lleva. */
export const gotoDestination = (unit: Unit): Pos | undefined =>
  unit.standingOrder && STANDING_ORDER_TYPES[unit.standingOrder.kind].travels ? unit.standingOrder.at : undefined;

/** [CAMBIO] Va por su cuenta: es de una escuadra con orden y lleva otra propia distinta. */
export function isDetached(s: GameState, unit: Unit): boolean {
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return !!unit.standingOrder && !!squadOrder && !sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder));
}

/** Unidades de esa escuadra que siguen su orden (no destacadas). */
export const followers = (s: GameState, squad: Squad) => squadUnits(s, squad.id).filter((unit) => !unit.standingOrder);

/** Los ids de escuadra a los que pertenecen todas sus unidades vivas de esta lista. */
export function wholeSquads(s: GameState, units: readonly Unit[]): Map<number, Squad> {
  const ids = new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])));
  const picked = new Set(units.map((unit) => unit.uid));
  const isWhole = (id: number) => squadUnits(s, id).every((unit) => !isAlive(unit) || picked.has(unit.uid));
  const whole = new Map<number, Squad>();
  for (const id of ids) {
    const squad = squadById(s, id);
    if (squad && isWhole(id)) whole.set(id, squad);
  }
  return whole;
}

/** Han llegado a la zona de la orden todas las que siguen a la escuadra (o ya no estan). */
export const followersArrived = (s: GameState, squad: Squad): boolean =>
  followers(s, squad).every((unit) => !isAlive(unit) || atStandingOrder(s, unit));

/**
 * Por que no se puede dar esa orden ahi a unidades del equipo `team` (null = se puede): alguna tiene
 * que poder cumplirla (atacar y defender, alguna que luche; capturar, alguna que capture y un
 * edificio que no sea ya de la alianza); ir alli, todas tienen que poder ir.
 */
export function standingOrderBlock(
  s: GameState,
  team: TeamId,
  kind: StandingOrderKind,
  at: Pos,
  units: readonly Unit[],
): StandingOrderBlock | null {
  return STANDING_ORDER_TYPES[kind].block(s, team, at, units);
}

/**
 * Ordenes que tiene sentido ofrecer en una casilla (clic derecho o pulsacion larga en el destino, con
 * unidades elegidas), en el orden del menu: el `menuRank` de cada tipo (con un enemigo visible ahi,
 * atacar va primero; si no, con un edificio que estas unidades pueden capturar, capturar; defender
 * siempre se puede). `enemyHere`: hay un enemigo que el jugador ve en esa casilla (la niebla la decide
 * la escena).
 */
export function standingOrderChoices(s: GameState, team: TeamId, at: Pos, units: readonly Unit[], enemyHere: boolean): StandingOrderKind[] {
  const mine = teamUnits(s, team, units);
  if (!mine.length) return [];
  const ranked = STANDING_ORDER_KINDS.flatMap((kind) => {
    const rank = STANDING_ORDER_TYPES[kind].menuRank({ enemyHere, canGive: () => standingOrderBlock(s, team, kind, at, mine) === null });
    return rank === null ? [] : [{ kind, rank }];
  });
  // sort es estable: a igual puesto, el orden de STANDING_ORDER_TYPES.
  return ranked.sort((first, second) => first.rank - second.rank).map((entry) => entry.kind);
}

/** Ya ha llegado a la zona de su orden (a 1 casilla o menos). */
export function atStandingOrder(s: GameState, unit: Unit): boolean {
  const standingOrder = effectiveStandingOrder(s, unit);
  return !!standingOrder && manhattan(unit, standingOrder.at) <= 1;
}

/**
 * [CAMBIO] Dos unidades van en formacion: misma escuadra y misma orden (mismo destino; capturar y
 * atacar cuentan igual, porque con "capturar" las que no capturan van escoltando con "atacar").
 */
export function sameFormation(s: GameState, first: Unit, second: Unit): boolean {
  if (first.squad === undefined || first.squad !== second.squad || first.team !== second.team) return false;
  const firstOrder = turnEndOrderOf(s, first);
  const secondOrder = turnEndOrderOf(s, second);
  if (!firstOrder || !secondOrder) return false;
  const holds = (standingOrder: StandingOrder) => STANDING_ORDER_TYPES[standingOrder.kind].holdsPosition;
  return holds(firstOrder) === holds(secondOrder) && samePos(firstOrder.at, secondOrder.at);
}

/** [CAMBIO] La escuadra entera (dos o mas unidades) lleva la misma orden: avanza en formacion. */
export function squadInFormation(s: GameState, id: number): boolean {
  const units = squadUnits(s, id);
  return units.length > 1 && units.every((unit) => sameFormation(s, units[0]!, unit));
}
