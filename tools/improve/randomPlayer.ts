/**
 * Un "jugador" que hace jugadas legales al azar (mover, atacar, capturar, unir, subir, bajar,
 * abastecer, comprar). No juega bien: sirve para recorrer combinaciones raras que la IA nunca prueba.
 * Es un controlador (`Controller`, core/session): propone sus acciones y la sesion las manda; mira
 * la partida solo con las funciones publicas de las reglas, como la interfaz del juego.
 */
import { canFight } from '@core/util/predicates';
import {
  attackTargets,
  buyOptions,
  canCapture,
  cargoUnits,
  loadTargets,
  mergeTargets,
  moveRange,
  reachableTiles,
  teamUnits,
  unitAt,
  unloadTiles,
  canStillAct,
  canStillFire,
} from '@core/rules';
import { posOf } from '@core/geom';
import { propose, type Controller, type TurnPlan, type TurnStep } from '@core/session';
import type { ActionResult, GameAction, GameState, Rng, TeamId, Unit } from '@core/model';

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];

/** Los pasos de proponer acciones: cada uno da si la accion valia. */
type Proposals = Generator<TurnStep, boolean, ActionResult | undefined>;

/** Propone la accion y dice si valia. */
function* tried(action: GameAction): Proposals {
  return (yield* propose(action)).ok;
}

/** Juega al azar, con `rng`. */
export const randomController = (rng: Rng): Controller => ({
  name: 'random',
  playTurn: (view) => randomTurn(view.state, rng, view.team),
});

/** El turno de `team` al azar: cada unidad que puede actuar hace algo, y despues compra en algunos edificios. */
function* randomTurn(s: GameState, rng: Rng, team: TeamId): TurnPlan {
  const order = teamUnits(s, team).map((unit) => unit.uid);
  for (const uid of order) {
    const unit = s.units.find((candidate) => candidate.uid === uid);
    if (!unit || !canStillAct(unit) || unit.carrier !== null) continue;
    yield* actRandomly(s, rng, unit);
  }
  yield* buyRandomly(s, rng, team);
}

/** Compra algo que se pueda pagar en algunos de sus edificios libres. */
function* buyRandomly(s: GameState, rng: Rng, team: TeamId): Proposals {
  for (const building of s.buildings) {
    if (building.owner !== team || unitAt(s, building) || rng() < 0.4) continue;
    const option = pick(
      rng,
      buyOptions(s, building).filter((candidate) => candidate.affordable),
    );
    if (option) yield* tried({ kind: 'buy', at: posOf(building), unitType: option.unitType.id });
  }
  return true;
}

/** Algo al azar con la unidad: unirse, subir, o moverse y hacer algo desde alli. */
function* actRandomly(s: GameState, rng: Rng, unit: Unit): Proposals {
  const uid = unit.uid;
  const range = moveRange(s, unit);
  const roll = rng();
  if (roll < 0.08) {
    const target = pick(rng, mergeTargets(s, unit, range));
    if (target && (yield* tried({ kind: 'merge', uid, into: target.uid }))) return true;
  } else if (roll < 0.16) {
    const target = pick(rng, loadTargets(s, unit, range));
    if (target && (yield* tried({ kind: 'load', uid, into: target.uid }))) return true;
  }
  // Mover (o quedarse) y luego hacer algo desde alli.
  const dest = rng() < 0.85 ? pick(rng, reachableTiles(range)) : undefined;
  if (dest) yield* tried({ kind: 'move', uid, to: dest });
  if (!s.units.includes(unit) || !canStillAct(unit)) return true;
  const passengers = cargoUnits(s, unit);
  if (passengers.length && rng() < 0.5) {
    const passenger = pick(rng, passengers)!;
    const at = pick(rng, unloadTiles(s, unit, passenger));
    if (at) yield* tried({ kind: 'unload', uid, passenger: passenger.uid, to: at });
  }
  if (!s.units.includes(unit) || !canStillAct(unit)) return true;
  const target = canFight(s, unit) && canStillFire(s, unit) ? pick(rng, attackTargets(s, unit)) : undefined;
  if (target && rng() < 0.8 && (yield* tried({ kind: 'attack', uid, target: target.uid }))) return true;
  if (canCapture(s, unit) && rng() < 0.9 && (yield* tried({ kind: 'capture', uid }))) return true;
  if (rng() < 0.3) yield* tried({ kind: 'supply', uid });
  if (s.units.includes(unit) && canStillAct(unit)) yield* tried({ kind: 'wait', uid });
  return true;
}
