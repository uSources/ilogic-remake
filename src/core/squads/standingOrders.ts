/**
 * [CAMBIO] Ordenes permanentes del jugador (estilo RTS): la de cada escuadra y la propia de cada unidad
 * (destacada). Logica pura: la usan la escena y la IA, que las cumple al terminar el turno
 * (ai/standingOrders.ts).
 */
import { manhattan, samePos, posOf } from '../geom';
import { buildingAt } from '../rules/queries';
import { isAlive, isCapturer } from '../util/predicates';
import { areAllied } from '../teams';
import type { GameState, Pos, Squad, StandingOrder, StandingOrderKind, TeamId, Unit } from '../model';
import { squadById, squadUnits, unitsOfTeam } from './queries';

/** Que dice cada tipo de orden permanente (el Record obliga a tenerlos todos). */
const STANDING_ORDER_NAMES: Record<StandingOrderKind, string> = { attack: 'atacar', capture: 'capturar', defend: 'defender' };
/** Los tipos de orden permanente que hay (para comprobar los que vienen de fuera, como una partida guardada). */
export const STANDING_ORDER_KINDS = Object.keys(STANDING_ORDER_NAMES) as readonly StandingOrderKind[];

/** El valor es un tipo de orden permanente. */
export const isStandingOrderKind = (value: unknown): value is StandingOrderKind => STANDING_ORDER_KINDS.some((kind) => kind === value);

export const sameStandingOrder = (first: StandingOrder, second: StandingOrder): boolean =>
  first.kind === second.kind && samePos(first.at, second.at);

const copyStandingOrder = (standingOrder: StandingOrder): StandingOrder => ({
  kind: standingOrder.kind,
  at: posOf(standingOrder.at),
});

/** La orden tal como la cumple esta unidad: con "capturar", las que no pueden capturar van de escolta (atacar). */
export function forUnit(s: GameState, unit: Unit, standingOrder: StandingOrder): StandingOrder {
  const kind = standingOrder.kind === 'capture' && !isCapturer(s, unit) ? 'attack' : standingOrder.kind;
  return { ...copyStandingOrder(standingOrder), kind };
}

/**
 * [CAMBIO] La orden que cumple la unidad: la suya propia si la tiene (destacada) y si no la de su
 * escuadra (adaptada: escolta en una captura). undefined = no tiene orden.
 */
export function effectiveStandingOrder(s: GameState, unit: Unit): StandingOrder | undefined {
  // Llevada a mano a una casilla lejana (Unit.travelTo): eso manda mientras dura.
  if (unit.travelTo) return undefined;
  if (unit.standingOrder) return unit.standingOrder;
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return squadOrder ? forUnit(s, unit, squadOrder) : undefined;
}

/** [CAMBIO] Va por su cuenta: es de una escuadra con orden y lleva otra propia distinta. */
export function isDetached(s: GameState, unit: Unit): boolean {
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  return !!unit.standingOrder && !!squadOrder && !sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder));
}

/** Unidades del jugador de esa escuadra que siguen su orden (no destacadas). */
const followers = (s: GameState, squad: Squad) => squadUnits(s, squad.id).filter((unit) => !unit.standingOrder);

/** Los ids de escuadra a los que pertenecen todas sus unidades vivas de esta lista. */
function wholeSquads(s: GameState, units: readonly Unit[]): Set<number> {
  const ids = new Set(units.flatMap((unit) => (unit.squad === undefined ? [] : [unit.squad])));
  const picked = new Set(units.map((unit) => unit.uid));
  const isWhole = (id: number) => squadUnits(s, id).every((unit) => !isAlive(unit) || picked.has(unit.uid));
  return new Set([...ids].filter(isWhole));
}

/** El edificio de esa casilla ya es de la alianza de `team` (o no hay): no hay nada que capturar. */
function isOwnedOrMissing(s: GameState, team: TeamId, at: Pos): boolean {
  const building = buildingAt(s, at);
  return !building || (building.owner !== null && areAllied(s, building.owner, team));
}

/** Por que no se puede dar esa orden ahi a unidades del equipo `team` (null = se puede). */
export function standingOrderBlock(
  s: GameState,
  team: TeamId,
  kind: StandingOrderKind,
  at: Pos,
  units: readonly Unit[],
): 'noBuilding' | 'noCapturer' | null {
  if (kind !== 'capture') return null;
  if (isOwnedOrMissing(s, team, at)) return 'noBuilding';
  if (!units.some((unit) => isCapturer(s, unit))) return 'noCapturer';
  return null;
}

/**
 * Ordenes que tiene sentido ofrecer en una casilla (clic derecho o pulsacion larga en el destino, con
 * unidades elegidas), en el orden del menu. Con un enemigo visible ahi, atacar va primero; si no, con
 * un edificio que estas unidades pueden capturar, capturar va primero. Defender siempre se puede.
 * `enemyHere`: hay un enemigo que el jugador ve en esa casilla (la niebla la decide la escena).
 */
export function standingOrderChoices(s: GameState, team: TeamId, at: Pos, units: readonly Unit[], enemyHere: boolean): StandingOrderKind[] {
  const mine = unitsOfTeam(team, units);
  if (!mine.length) return [];
  const canCapture = standingOrderBlock(s, team, 'capture', at, mine) === null;
  if (enemyHere) return canCapture ? ['attack', 'capture', 'defend'] : ['attack', 'defend'];
  return canCapture ? ['capture', 'attack', 'defend'] : ['attack', 'defend'];
}

/** La unidad se queda con la orden como propia, salvo que sea justo la de su escuadra (entonces la sigue). */
function giveOwnStandingOrder(s: GameState, unit: Unit, standingOrder: StandingOrder): void {
  unit.standingOrder = forUnit(s, unit, standingOrder);
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  if (squadOrder && sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder))) delete unit.standingOrder;
}

/**
 * Da una orden con destino a estas unidades del equipo `team` (las de otros equipos no la reciben). Si son una escuadra entera, la orden es de
 * la escuadra (y se olvidan las propias); si son solo algunas, cada una se queda con la orden como
 * propia (destacada) y al cumplirla vuelve a la de su escuadra. Con "capturar", las que no pueden
 * capturar van de escolta. Devuelve cuantas la han recibido.
 */
export function giveStandingOrder(s: GameState, team: TeamId, units: readonly Unit[], kind: StandingOrderKind, at: Pos): number {
  const mine = unitsOfTeam(team, units);
  const standingOrder = copyStandingOrder({ kind, at });
  const whole = wholeSquads(s, mine);
  for (const id of whole) squadById(s, id)!.standingOrder = copyStandingOrder(standingOrder);
  for (const unit of mine) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else giveOwnStandingOrder(s, unit, standingOrder);
    delete unit.travelTo;
  }
  return mine.length;
}

/**
 * Quita la orden a estas unidades. A una escuadra entera se le quita la suya (se quedan esperando).
 * Una destacada vuelve a la orden de su escuadra; una que seguia a su escuadra se queda guardando
 * donde esta (defender aqui), que es "parar" sin sacarla de la escuadra.
 */
export function cancelStandingOrder(s: GameState, units: readonly Unit[]): void {
  const whole = wholeSquads(s, units);
  for (const id of whole) delete squadById(s, id)!.standingOrder;
  for (const unit of units) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else if (unit.standingOrder) delete unit.standingOrder;
    else if (effectiveStandingOrder(s, unit)) unit.standingOrder = { kind: 'defend', at: posOf(unit) };
  }
}

/** La orden de la escuadra ya esta cumplida: edificio tomado, o todas las que la siguen han llegado. */
function squadOrderDone(s: GameState, squad: Squad, standingOrder: StandingOrder): boolean {
  if (standingOrder.kind === 'capture') return isOwnedOrMissing(s, squad.team, standingOrder.at);
  return followers(s, squad).every((unit) => !isAlive(unit) || atStandingOrder(s, unit));
}

/**
 * [CAMBIO] La unidad ha cumplido la orden que seguia. Si era la suya, la olvida (vuelve a la de su
 * escuadra). Si era la de la escuadra, se quita cuando ya esta cumplida para la escuadra: al
 * capturar el edificio, o al atacar cuando han llegado todas las que la siguen.
 */
export function finishStandingOrder(s: GameState, unit: Unit): void {
  if (unit.standingOrder) {
    delete unit.standingOrder;
    return;
  }
  const squad = squadById(s, unit.squad);
  if (!squad?.standingOrder) return;
  if (squadOrderDone(s, squad, squad.standingOrder)) delete squad.standingOrder;
}

/**
 * [CAMBIO] Has empezado a mano una captura con esta unidad: si llevaba una orden (suya o de su
 * escuadra) que no es capturar este edificio, ahora lo es, para que el turno siguiente no lo deje a
 * medias. En una escuadra queda destacada y, con el edificio tomado, vuelve a la orden de la escuadra.
 */
export function keepCapturing(s: GameState, unit: Unit): void {
  const building = buildingAt(s, unit);
  const standingOrder = effectiveStandingOrder(s, unit);
  if (!building || !standingOrder || isOwnedOrMissing(s, unit.team, unit)) return;
  if (standingOrder.kind === 'capture' && samePos(standingOrder.at, unit)) return;
  unit.standingOrder = { kind: 'capture', at: posOf(unit) };
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
  const firstOrder = effectiveStandingOrder(s, first);
  const secondOrder = effectiveStandingOrder(s, second);
  if (!firstOrder || !secondOrder) return false;
  const holds = (standingOrder: StandingOrder) => standingOrder.kind === 'defend';
  return holds(firstOrder) === holds(secondOrder) && samePos(firstOrder.at, secondOrder.at);
}

/** [CAMBIO] La escuadra entera (dos o mas unidades) lleva la misma orden: avanza en formacion. */
export function squadInFormation(s: GameState, id: number): boolean {
  const units = squadUnits(s, id);
  return units.length > 1 && units.every((unit) => sameFormation(s, units[0]!, unit));
}

/**
 * Si todas las unidades de la escuadra llevan la misma orden propia (contando la escolta de una
 * captura), pasa a ser la orden de la escuadra. Asi una escuadra formada con unidades que ya iban
 * juntas, o una partida guardada antes de que las escuadras tuvieran orden, sigue igual.
 */
export function liftStandingOrder(s: GameState, squad: Squad): void {
  const units = squadUnits(s, squad.id);
  if (!units.length || units.some((unit) => !unit.standingOrder)) return;
  // La de capturar manda: las demas van de escolta con "atacar" al mismo sitio.
  const lead = units.find((unit) => unit.standingOrder!.kind === 'capture') ?? units[0]!;
  const standingOrder = lead.standingOrder!;
  if (!units.every((unit) => sameStandingOrder(unit.standingOrder!, forUnit(s, unit, standingOrder)))) return;
  squad.standingOrder = copyStandingOrder(standingOrder);
  for (const unit of units) delete unit.standingOrder;
}
