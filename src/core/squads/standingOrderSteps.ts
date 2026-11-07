/**
 * [CAMBIO] Los pasos que cambian las ordenes permanentes (`giveStandingOrder`, `cancelStandingOrder`,
 * `finishStandingOrder`, `keepCapturing`, `liftStandingOrder`): solo los llaman las acciones y los
 * pasos de turno (`APPLY_STEPS`, eslint.config.js, prohibe este modulo a quien decide y a quien mira).
 */
import { samePos, posOf } from '../geom';
import { buildingAt, teamUnits } from '../rules/queries';
import type { GameState, Pos, Squad, StandingOrder, StandingOrderKind, TeamId, Unit } from '../model';
import { squadById, squadUnits } from './queries';
import { capturingKind, holdingKind, isOwnedOrMissing, isTurnEndOrder, isUnitOnly, STANDING_ORDER_TYPES } from './standingOrderTypes';
import {
  copyStandingOrder,
  effectiveStandingOrder,
  followersArrived,
  forUnit,
  sameStandingOrder,
  wholeSquads,
} from './standingOrderQueries';

/** La unidad se queda con la orden como propia, salvo que sea justo la de su escuadra (entonces la sigue). */
function giveOwnStandingOrder(s: GameState, unit: Unit, standingOrder: StandingOrder): void {
  unit.standingOrder = forUnit(s, unit, standingOrder);
  const squadOrder = squadById(s, unit.squad)?.standingOrder;
  if (squadOrder && sameStandingOrder(unit.standingOrder, forUnit(s, unit, squadOrder))) delete unit.standingOrder;
}

/**
 * Da una orden con destino a estas unidades del equipo `team` (las de otros equipos no la reciben).
 * Si son una escuadra entera, la orden es de la escuadra (y se olvidan las propias); si son solo
 * algunas, cada una se queda con la orden como propia (destacada) y al cumplirla vuelve a la de su
 * escuadra. Con "capturar", las que no pueden capturar van de escolta. Devuelve cuantas la han
 * recibido.
 */
export function giveStandingOrder(s: GameState, team: TeamId, units: readonly Unit[], kind: StandingOrderKind, at: Pos): number {
  const mine = teamUnits(s, team, units);
  const standingOrder = copyStandingOrder({ kind, at });
  // La de ir alli es siempre de cada unidad, aunque sean una escuadra entera.
  const squadOrder = isTurnEndOrder(standingOrder) ? standingOrder : null;
  const whole = squadOrder ? wholeSquads(s, mine) : new Map<number, Squad>();
  if (squadOrder) for (const squad of whole.values()) squad.standingOrder = copyStandingOrder(squadOrder);
  for (const unit of mine) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else giveOwnStandingOrder(s, unit, standingOrder);
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
  for (const squad of whole.values()) delete squad.standingOrder;
  for (const unit of units) {
    if (unit.squad !== undefined && whole.has(unit.squad)) delete unit.standingOrder;
    else if (unit.standingOrder) delete unit.standingOrder;
    else if (effectiveStandingOrder(s, unit)) unit.standingOrder = { kind: holdingKind(), at: posOf(unit) };
  }
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
  const done = STANDING_ORDER_TYPES[squad.standingOrder.kind].squadDone(s, squad, squad.standingOrder.at, () => followersArrived(s, squad));
  if (done) delete squad.standingOrder;
}

/**
 * [CAMBIO] Has empezado a mano una captura con esta unidad: si llevaba una orden (suya o de su
 * escuadra) que no es capturar este edificio, ahora lo es, para que el turno siguiente no lo deje a
 * medias. En una escuadra queda destacada y, con el edificio tomado, vuelve a la orden de la escuadra.
 * Devuelve la orden nueva (para su suceso), o null si no ha cambiado nada.
 */
export function keepCapturing(s: GameState, unit: Unit): StandingOrder | null {
  const building = buildingAt(s, unit);
  const standingOrder = effectiveStandingOrder(s, unit);
  // La de ir alli no se toca: capturar de paso no la cambia (la unidad sigue su viaje).
  if (!building || !standingOrder || isUnitOnly(standingOrder.kind) || isOwnedOrMissing(s, unit.team, unit)) return null;
  const capturing = capturingKind();
  if (standingOrder.kind === capturing && samePos(standingOrder.at, unit)) return null;
  unit.standingOrder = { kind: capturing, at: posOf(unit) };
  return copyStandingOrder(unit.standingOrder);
}

/**
 * Si todas las unidades de la escuadra llevan la misma orden propia (contando la escolta de una
 * captura), pasa a ser la orden de la escuadra. Asi una escuadra formada con unidades que ya iban
 * juntas, o una partida guardada antes de que las escuadras tuvieran orden, sigue igual.
 */
export function liftStandingOrder(s: GameState, squad: Squad): void {
  const units = squadUnits(s, squad.id);
  const withOrder = units.flatMap((unit) =>
    unit.standingOrder && isTurnEndOrder(unit.standingOrder) ? [{ unit, order: unit.standingOrder }] : [],
  );
  const [first] = withOrder;
  // Si alguna no lleva orden propia, la escuadra no tiene una comun.
  if (!first || withOrder.length !== units.length) return;
  // La que manda (`leadsSquad`, capturar): las demas van de escolta (con "atacar") al mismo sitio.
  const lead = withOrder.find((entry) => STANDING_ORDER_TYPES[entry.order.kind].leadsSquad) ?? first;
  const allAgree = withOrder.every((entry) => sameStandingOrder(entry.order, forUnit(s, entry.unit, lead.order)));
  if (!allAgree) return;
  squad.standingOrder = copyStandingOrder(lead.order);
  for (const unit of units) delete unit.standingOrder;
}
