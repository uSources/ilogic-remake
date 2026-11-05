/**
 * Un "jugador" que hace jugadas legales al azar (mover, atacar, capturar, unir, subir, bajar,
 * abastecer, comprar). No juega bien: sirve para recorrer combinaciones raras que la IA nunca prueba.
 * Usa solo las funciones publicas de las reglas, como la interfaz del juego.
 */
import { canFight } from '@core/util/predicates';
import { dispatch } from '@core/actions';
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
import type { GameAction, GameState, Rng, TeamId, Unit } from '@core/model';

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];

/** Juega el turno de `team` al azar. Llama a `after` tras cada accion (para comprobar invariantes). */
export function randomTurn(s: GameState, rng: Rng, team: TeamId, after: (what: string) => void): void {
  const order = teamUnits(s, team).map((unit) => unit.uid);
  for (const uid of order) {
    const unit = s.units.find((candidate) => candidate.uid === uid);
    if (!unit || !canStillAct(unit) || unit.carrier !== null) continue;
    act(s, rng, unit, after);
  }
  for (const building of s.buildings) {
    if (building.owner !== team || unitAt(s, building) || rng() < 0.4) continue;
    const option = pick(
      rng,
      buyOptions(s, building).filter((candidate) => candidate.affordable),
    );
    if (!option) continue;
    const bought = tryAction(s, team, { kind: 'buy', at: posOf(building), unitType: option.unitType.id });
    if (bought) after(`compra ${option.unitType.id} en (${building.x},${building.y})`);
  }
}

/** Manda la accion como cualquier jugador (dispatch): si valia. */
const tryAction = (s: GameState, team: TeamId, action: GameAction): boolean => dispatch(s, team, action).ok;

function act(s: GameState, rng: Rng, unit: Unit, after: (what: string) => void): void {
  const team = unit.team;
  const uid = unit.uid;
  const range = moveRange(s, unit);
  const roll = rng();
  if (roll < 0.08) {
    const target = pick(rng, mergeTargets(s, unit, range));
    if (target && tryAction(s, team, { kind: 'merge', uid, into: target.uid })) return after(`${uid} se une a ${target.uid}`);
  } else if (roll < 0.16) {
    const target = pick(rng, loadTargets(s, unit, range));
    if (target && tryAction(s, team, { kind: 'load', uid, into: target.uid })) return after(`${uid} sube a ${target.uid}`);
  }
  // Mover (o quedarse) y luego hacer algo desde alli.
  const dest = rng() < 0.85 ? pick(rng, reachableTiles(range)) : undefined;
  if (dest && tryAction(s, team, { kind: 'move', uid, to: dest })) after(`${uid} mueve a (${dest.x},${dest.y})`);
  if (!s.units.includes(unit) || !canStillAct(unit)) return;
  const passengers = cargoUnits(s, unit);
  if (passengers.length && rng() < 0.5) {
    const passenger = pick(rng, passengers)!;
    const at = pick(rng, unloadTiles(s, unit, passenger));
    if (at && tryAction(s, team, { kind: 'unload', uid, passenger: passenger.uid, to: at }))
      after(`${uid} baja a ${passenger.uid} en (${at.x},${at.y})`);
  }
  if (!s.units.includes(unit) || !canStillAct(unit)) return;
  const target = canFight(s, unit) && canStillFire(s, unit) ? pick(rng, attackTargets(s, unit)) : undefined;
  if (target && rng() < 0.8 && tryAction(s, team, { kind: 'attack', uid, target: target.uid }))
    return after(`${uid} ataca a ${target.uid}`);
  if (canCapture(s, unit) && rng() < 0.9 && tryAction(s, team, { kind: 'capture', uid })) return after(`${uid} captura`);
  if (rng() < 0.3 && tryAction(s, team, { kind: 'supply', uid })) after(`${uid} abastece`);
  if (s.units.includes(unit) && canStillAct(unit) && tryAction(s, team, { kind: 'wait', uid })) after(`${uid} espera`);
}
