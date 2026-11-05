/**
 * Un "jugador" que hace jugadas legales al azar (mover, atacar, capturar, unir, subir, bajar,
 * abastecer, comprar). No juega bien: sirve para recorrer combinaciones raras que la IA nunca prueba.
 * Usa solo las funciones publicas de las reglas, como la interfaz del juego.
 */
import { canFight } from '@core/util/predicates';
import {
  attackFull,
  attackTargets,
  buyOptions,
  canCapture,
  capture,
  cargoUnits,
  load,
  loadTargets,
  merge,
  mergeTargets,
  moveRange,
  moveUnit,
  reachableTiles,
  spawn,
  supply,
  teamUnits,
  unitAt,
  unload,
  unloadTiles,
  wait,
} from '@core/rules';
import type { GameState, Rng, TeamId, Unit } from '@core/model';

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];

/** Juega el turno de `team` al azar. Llama a `after` tras cada accion (para comprobar invariantes). */
export function randomTurn(s: GameState, rng: Rng, team: TeamId, after: (what: string) => void): void {
  const order = teamUnits(s, team).map((unit) => unit.uid);
  for (const uid of order) {
    const unit = s.units.find((candidate) => candidate.uid === uid);
    if (!unit || !unit.active || unit.carrier !== null) continue;
    act(s, rng, unit, after);
  }
  for (const building of s.buildings) {
    if (building.owner !== team || unitAt(s, building) || rng() < 0.4) continue;
    const option = pick(
      rng,
      buyOptions(s, building).filter((candidate) => candidate.affordable),
    );
    if (option && spawn(s, building, option.unitType)) after(`compra ${option.unitType.id} en (${building.x},${building.y})`);
  }
}

function act(s: GameState, rng: Rng, unit: Unit, after: (what: string) => void): void {
  const range = moveRange(s, unit);
  const roll = rng();
  if (roll < 0.08) {
    const target = pick(rng, mergeTargets(s, unit, range));
    if (target && merge(s, unit, target)) return after(`${unit.uid} se une a ${target.uid}`);
  } else if (roll < 0.16) {
    const target = pick(rng, loadTargets(s, unit, range));
    if (target && load(s, unit, target)) return after(`${unit.uid} sube a ${target.uid}`);
  }
  // Mover (o quedarse) y luego hacer algo desde alli.
  const dest = rng() < 0.85 ? pick(rng, reachableTiles(range)) : undefined;
  if (dest && moveUnit(s, unit, dest, range)) after(`${unit.uid} mueve a (${dest.x},${dest.y})`);
  if (!s.units.includes(unit) || !unit.active) return;
  const passengers = cargoUnits(s, unit);
  if (passengers.length && rng() < 0.5) {
    const passenger = pick(rng, passengers)!;
    const at = pick(rng, unloadTiles(s, unit, passenger));
    if (at && unload(s, unit, passenger, at)) after(`${unit.uid} baja a ${passenger.uid} en (${at.x},${at.y})`);
  }
  if (!s.units.includes(unit) || !unit.active) return;
  const target = canFight(s, unit) && unit.canFire ? pick(rng, attackTargets(s, unit)) : undefined;
  if (target && rng() < 0.8) {
    attackFull(s, unit, target, rng);
    if (s.units.includes(unit)) wait(unit);
    return after(`${unit.uid} ataca a ${target.uid}`);
  }
  if (canCapture(s, unit) && rng() < 0.9 && capture(s, unit)) return after(`${unit.uid} captura`);
  if (rng() < 0.3 && supply(s, unit) > 0) after(`${unit.uid} abastece`);
  if (s.units.includes(unit) && unit.active) {
    wait(unit);
    after(`${unit.uid} espera`);
  }
}
