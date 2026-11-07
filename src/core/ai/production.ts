/**
 * Que fabrica la IA en sus edificios al final de su turno.
 */

import { teamState } from '../teams';
import { unitTypeOf } from '../gameContent';
import { buyOptions, hasFullArmy, projectedIncome, usesCommandPoints, type BuyOption } from '../rules/economy';
import { isCapturer } from '../util/predicates';
import { teamUnits, unitAt } from '../rules/queries';
import type { ActionPlan, Building, GameState, Rng, Unit } from '../model';
import { posOf } from '../geom';
import { act, type PlayCtx } from '../autopilot/context';
import { weightedPick } from '../util/random';
import { compareKeys } from '../util/pick';

/** Elige una compra al azar, con mas peso a lo mas caro (raiz del precio). */
const pickByCost = (options: readonly BuyOption[], rng: Rng): BuyOption | null =>
  weightedPick(options, (option) => Math.sqrt(option.cost), rng, null);

/**
 * En que orden fabrican los edificios. Con puntos de mando (`limited`), primero los de lo grande,
 * entre ellos al azar, y despues de mas caro a mas barato; si no, el orden del mapa.
 * [CAMBIO] Los edificios de lo grande (Fabrica, Aeropuerto) van en orden al azar: si el Aeropuerto
 * (Caza, 20000) iba siempre primero se llevaba el dinero o el ahorro y la Fabrica casi nunca podia
 * pagar un Tanque (0,3 % de las compras; ver balance/reports/tanques-vs-infanteria.md).
 */
function productionOrder(s: GameState, play: PlayCtx, rng: Rng, limited: boolean): Building[] {
  const priciest = (building: Building) => Math.max(0, ...buyOptions(s, building).map((option) => option.cost));
  // Se tira el dado aunque no haga falta ordenar, para gastar la misma suerte en cualquier caso.
  const ranked = s.buildings.map((building) => {
    const top = priciest(building);
    const makesBigUnits = top >= play.profile.weights.BIGUNITCOST;
    // Lo grande primero (entre ellos, al azar); despues, de mas caro a mas barato.
    return { building, priority: makesBigUnits ? [1, rng()] : [0, top] };
  });
  if (!limited) return s.buildings;
  // sort es estable: a igual prioridad, el orden del mapa.
  return ranked.sort((first, second) => compareKeys(second.priority, first.priority)).map((entry) => entry.building);
}

/** Lo que se plantea comprar en el edificio: lo que cabe (o se paga) sin repetir unidades de apoyo, e infanteria si faltan. */
function purchaseOptions(s: GameState, play: PlayCtx, building: Building, mine: Unit[], limited: boolean): BuyOption[] {
  const fits = (option: BuyOption) => (limited ? option.blocked === undefined || option.blocked === 'funds' : option.affordable);
  // Lo que no combate ("ai": { "support": true } en units.json): como mucho uno de cada a la vez.
  const repeatsSupport = (option: BuyOption) => option.unitType.isSupport && mine.some((unit) => unitTypeOf(s, unit) === option.unitType);
  const options = buyOptions(s, building).filter((option) => fits(option) && !repeatsSupport(option));
  const capturers = mine.filter((unit) => isCapturer(s, unit)).length;
  const isAffordableCapturer = (option: BuyOption) => option.unitType.canCapture && option.affordable;
  if (capturers < play.profile.weights.MINCAPTURERS && options.some(isAffordableCapturer)) return options.filter(isAffordableCapturer);
  return options;
}

/** Que compra: una opcion, `'save'` para ahorrar (lo elegido se paga el turno que viene) o null para nada aqui. */
function choosePurchase(options: BuyOption[], fundsNextTurn: number, rng: Rng): BuyOption | 'save' | null {
  const choice = pickByCost(options, rng);
  if (!choice) return null;
  if (choice.affordable) return choice;
  if (choice.cost <= fundsNextTurn) return 'save';
  return pickByCost(
    options.filter((option) => option.affordable),
    rng,
  );
}

/**
 * Fabricar en cada edificio propio libre.
 * [CAMBIO] el original elegia al azar entre todo lo pagable y acababa lleno de unidades que
 * no combaten. Ahora: elige al azar dando mas peso a lo mas caro, sin repetir unidades de
 * apoyo, y asegura infanteria para capturar.
 * [CAMBIO] Con puntos de mando el ejercito tiene tope y gastarlo todo cada turno lo llena de
 * soldados de 1 punto. Entonces elige entre todo lo que cabe (no solo lo que puede pagar), empieza
 * por los edificios que fabrican lo grande y, si lo elegido aun no se paga, ahorra ese turno.
 */
export function* produce(s: GameState, play: PlayCtx, rng: Rng): ActionPlan {
  const me = play.me;
  const limited = usesCommandPoints(s);
  const order = productionOrder(s, play, rng, limited);
  const income = projectedIncome(s, me);
  for (const building of order) {
    if (building.owner !== me || hasFullArmy(s, me) || unitAt(s, building)) continue;
    const mine = teamUnits(s, me);
    const options = purchaseOptions(s, play, building, mine, limited);
    if (!options.length) continue;
    const purchase = choosePurchase(options, teamState(s, me).funds + income, rng);
    if (purchase === 'save') break;
    if (!purchase) continue;
    yield* act({ kind: 'buy', at: posOf(building), unitType: purchase.unitType.id });
  }
}
