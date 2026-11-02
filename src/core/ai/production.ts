/**
 * Que fabrica la IA en sus edificios al final de su turno.
 */
import { AI, RULES, UNIT, UNIT_SUPPORT } from '../data';
import { buildingIncome, buyOptions, spawn, upkeepOf, type BuyOption } from '../rules/economy';
import { teamUnits, unitAt } from '../rules/queries';
import type { Building, GameEvent, GameState, Rng, Team } from '../types';

/** Tipos que no combaten ("ai": { "support": true } en units.json): como mucho uno de cada a la vez. */
const SUPPORT_TYPES = new Set<number>(UNIT_SUPPORT.flatMap((sup, i) => (sup ? [i] : [])));

/** Elige uno al azar con probabilidad proporcional a su peso. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  let r = rng() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Un edificio que fabrica algo de este precio o mas fabrica "lo grande" (Fabrica, Aeropuerto). */
const BIG_UNIT = 10000;

/**
 * Fabricar en cada edificio propio libre.
 * [CAMBIO] el original elegia al azar entre todo lo pagable y acababa lleno de unidades que
 * no combaten. Ahora: elige al azar dando mas peso a lo mas caro, sin repetir unidades de
 * apoyo, y asegura infanteria para capturar.
 */
export function* produce(s: GameState, me: Team, rng: Rng): Generator<GameEvent> {
  // [CAMBIO] Con puntos de mando el ejercito tiene tope y gastarlo todo cada turno lo llena de
  // soldados de 1 punto. Entonces elige entre todo lo que cabe (no solo lo que puede pagar), empieza
  // por los edificios que fabrican lo grande y, si lo elegido aun no se paga, ahorra ese turno.
  // [CAMBIO] Los edificios de lo grande (Fabrica, Aeropuerto) van en orden al azar: si el Aeropuerto
  // (Caza, 20000) iba siempre primero se llevaba el dinero o el ahorro y la Fabrica casi nunca podia
  // pagar un Tanque (0,3 % de las compras; ver balance/reports/tanques-vs-infanteria.md).
  const limited = RULES.commandPoints !== null;
  const top = (b: Building) => Math.max(0, ...buyOptions(s, b).map((o) => o.cost));
  const key = new Map(s.buildings.map((b) => [b, top(b) >= BIG_UNIT ? BIG_UNIT + rng() : top(b) / BIG_UNIT]));
  const order = limited ? [...s.buildings].sort((x, y) => key.get(y)! - key.get(x)!) : s.buildings;
  const income = s.buildings.reduce((n, b) => n + (b.owner === me ? buildingIncome(b.type) : 0), 0) - upkeepOf(s, me);
  for (const b of order) {
    if (b.owner !== me || teamUnits(s, me).length >= RULES.maxUnits || unitAt(s, b.x, b.y)) continue;
    const mine = teamUnits(s, me);
    const fits = (o: BuyOption) => (limited ? o.blocked === undefined || o.blocked === 'funds' : o.affordable);
    let opts = buyOptions(s, b).filter((o) => fits(o) && !(SUPPORT_TYPES.has(o.type) && mine.some((u) => u.type === o.type)));
    if (!opts.length) continue;
    const capturers = mine.filter((u) => UNIT.cancapt[u.type]).length;
    if (capturers < AI.MINCAPTURERS && opts.some((o) => UNIT.cancapt[o.type] && o.affordable))
      opts = opts.filter((o) => UNIT.cancapt[o.type] && o.affordable);
    const weights = opts.map((o) => Math.sqrt(o.cost));
    let pick = weightedPick(opts, weights, rng);
    if (!pick.affordable) {
      if (pick.cost <= s.funds[me] + income) break; // se paga el turno que viene: ahorrar para ello
      const can = opts.filter((o) => o.affordable);
      if (!can.length) continue;
      pick = weightedPick(
        can,
        can.map((o) => Math.sqrt(o.cost)),
        rng,
      );
    }
    const u = spawn(s, b, pick.type);
    if (u) yield { kind: 'spawn', uid: u.uid, at: { x: b.x, y: b.y } };
  }
}
