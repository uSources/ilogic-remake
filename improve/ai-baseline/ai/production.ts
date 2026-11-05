// Copia de la IA guardada por npm run arena -- --snapshot (2026-11-05). No editar.
/**
 * Que fabrica la IA en sus edificios al final de su turno.
 */

import { teamState } from '@core/teams';
import { unitTypeOf, buildingTypeOf } from '@core/gameContent';
import { weightsOf } from '../weights';
import { buildingIncome, buyOptions, upkeepOf, type BuyOption } from '@core/rules/economy';
import { teamUnits, unitAt } from '@core/rules/queries';
import type { Building, GameEvent, GameState, Rng, TeamId, Unit } from '@core/model';
import { posOf } from '@core/geom';
import { act, type AiCtx } from './context';

/** Elige uno al azar con probabilidad proporcional a su peso. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  let remaining = rng() * weights.reduce((total, weight) => total + weight, 0);
  for (let i = 0; i < items.length; i++) {
    remaining -= weights[i]!;
    if (remaining < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Elige una compra al azar, con mas peso a lo mas caro (raiz del precio). */
const pickByCost = (options: readonly BuyOption[], rng: Rng): BuyOption =>
  weightedPick(
    options,
    options.map((option) => Math.sqrt(option.cost)),
    rng,
  );

/** Un edificio que fabrica algo de este precio o mas fabrica "lo grande" (Fabrica, Aeropuerto). */
const BIG_UNIT = 10000;

/**
 * En que orden fabrican los edificios. Con puntos de mando (`limited`), primero los de lo grande,
 * entre ellos al azar, y despues de mas caro a mas barato; si no, el orden del mapa.
 * [CAMBIO] Los edificios de lo grande (Fabrica, Aeropuerto) van en orden al azar: si el Aeropuerto
 * (Caza, 20000) iba siempre primero se llevaba el dinero o el ahorro y la Fabrica casi nunca podia
 * pagar un Tanque (0,3 % de las compras; ver balance/reports/tanques-vs-infanteria.md).
 */
function productionOrder(s: GameState, rng: Rng, limited: boolean): Building[] {
  const priciest = (building: Building) => Math.max(0, ...buyOptions(s, building).map((option) => option.cost));
  // Se tira el dado aunque no haga falta ordenar, para gastar la misma suerte en cualquier caso.
  const priority = new Map(
    s.buildings.map((building) => {
      const top = priciest(building);
      return [building, top >= BIG_UNIT ? BIG_UNIT + rng() : top / BIG_UNIT];
    }),
  );
  return limited
    ? [...s.buildings].sort((firstBuilding, secondBuilding) => priority.get(secondBuilding)! - priority.get(firstBuilding)!)
    : s.buildings;
}

/** Lo que gana el equipo cada turno: ingresos de sus edificios menos el mantenimiento de sus unidades. */
function netIncome(s: GameState, me: TeamId): number {
  const income = s.buildings.reduce(
    (total, building) => total + (building.owner === me ? buildingIncome(s, buildingTypeOf(s, building)) : 0),
    0,
  );
  return income - upkeepOf(s, me);
}

/** Lo que se plantea comprar en el edificio: lo que cabe (o se paga) sin repetir unidades de apoyo, e infanteria si faltan. */
function purchaseOptions(s: GameState, building: Building, mine: Unit[], limited: boolean): BuyOption[] {
  const fits = (option: BuyOption) => (limited ? option.blocked === undefined || option.blocked === 'funds' : option.affordable);
  // Lo que no combate ("ai": { "support": true } en units.json): como mucho uno de cada a la vez.
  const repeatsSupport = (option: BuyOption) => option.unitType.isSupport && mine.some((unit) => unitTypeOf(s, unit) === option.unitType);
  const options = buyOptions(s, building).filter((option) => fits(option) && !repeatsSupport(option));
  const capturers = mine.filter((unit) => unitTypeOf(s, unit).canCapture).length;
  const isAffordableCapturer = (option: BuyOption) => option.unitType.canCapture && option.affordable;
  if (capturers < weightsOf(s).MINCAPTURERS && options.some(isAffordableCapturer)) return options.filter(isAffordableCapturer);
  return options;
}

/** Que compra: una opcion, `'save'` para ahorrar (lo elegido se paga el turno que viene) o null para nada aqui. */
function choosePurchase(options: BuyOption[], fundsNextTurn: number, rng: Rng): BuyOption | 'save' | null {
  const pick = pickByCost(options, rng);
  if (pick.affordable) return pick;
  if (pick.cost <= fundsNextTurn) return 'save';
  const affordable = options.filter((option) => option.affordable);
  return affordable.length ? pickByCost(affordable, rng) : null;
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
export function* produce(s: GameState, ai: AiCtx, rng: Rng): Generator<GameEvent> {
  const me = ai.me;
  const limited = s.rules.commandPoints !== null;
  const order = productionOrder(s, rng, limited);
  const income = netIncome(s, me);
  for (const building of order) {
    const mine = teamUnits(s, me);
    if (building.owner !== me || mine.length >= s.rules.maxUnits || unitAt(s, building)) continue;
    const options = purchaseOptions(s, building, mine, limited);
    if (!options.length) continue;
    const purchase = choosePurchase(options, teamState(s, me).funds + income, rng);
    if (purchase === 'save') break;
    if (!purchase) continue;
    yield* act(s, ai, { kind: 'buy', at: posOf(building), unitType: purchase.unitType.id });
  }
}
