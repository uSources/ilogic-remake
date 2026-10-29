/**
 * Un "jugador" que hace jugadas legales al azar (mover, atacar, capturar, unir, subir, bajar,
 * abastecer, comprar). No juega bien: sirve para recorrer combinaciones raras que la IA nunca prueba.
 * Usa solo las funciones publicas de las reglas, como la interfaz del juego.
 */
import { UNIT } from '../../src/core/data';
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
} from '../../src/core/rules';
import type { GameState, Rng, Team, Unit } from '../../src/core/types';

const pick = <T>(rng: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rng() * xs.length)];

/** Juega el turno de `team` al azar. Llama a `after` tras cada accion (para comprobar invariantes). */
export function randomTurn(s: GameState, rng: Rng, team: Team, after: (what: string) => void): void {
  const order = teamUnits(s, team).map((u) => u.uid);
  for (const uid of order) {
    const u = s.units.find((x) => x.uid === uid);
    if (!u || !u.active || u.carrier !== null) continue;
    act(s, rng, u, after);
  }
  for (const b of s.buildings) {
    if (b.owner !== team || unitAt(s, b.x, b.y) || rng() < 0.4) continue;
    const o = pick(
      rng,
      buyOptions(s, b).filter((x) => x.affordable),
    );
    if (o && spawn(s, b, o.type)) after(`compra ${o.type} en (${b.x},${b.y})`);
  }
}

function act(s: GameState, rng: Rng, u: Unit, after: (what: string) => void): void {
  const r = moveRange(s, u);
  const roll = rng();
  if (roll < 0.08) {
    const t = pick(rng, mergeTargets(s, u, r));
    if (t && merge(s, u, t)) return after(`${u.uid} se une a ${t.uid}`);
  } else if (roll < 0.16) {
    const t = pick(rng, loadTargets(s, u, r));
    if (t && load(s, u, t)) return after(`${u.uid} sube a ${t.uid}`);
  }
  // Mover (o quedarse) y luego hacer algo desde alli.
  const dest = rng() < 0.85 ? pick(rng, reachableTiles(r)) : undefined;
  if (dest && moveUnit(s, u, dest, r)) after(`${u.uid} mueve a (${dest.x},${dest.y})`);
  if (!s.units.includes(u) || !u.active) return;
  const passengers = cargoUnits(s, u);
  if (passengers.length && rng() < 0.5) {
    const p = pick(rng, passengers)!;
    const at = pick(rng, unloadTiles(s, u, p));
    if (at && unload(s, u, p, at)) after(`${u.uid} baja a ${p.uid} en (${at.x},${at.y})`);
  }
  if (!s.units.includes(u) || !u.active) return;
  const t = UNIT.canfight[u.type] && u.canFire ? pick(rng, attackTargets(s, u)) : undefined;
  if (t && rng() < 0.8) {
    attackFull(s, u, t, rng);
    if (s.units.includes(u)) wait(u);
    return after(`${u.uid} ataca a ${t.uid}`);
  }
  if (canCapture(s, u) && rng() < 0.9 && capture(s, u)) return after(`${u.uid} captura`);
  if (rng() < 0.3 && supply(s, u) > 0) after(`${u.uid} abastece`);
  if (s.units.includes(u) && u.active) {
    wait(u);
    after(`${u.uid} espera`);
  }
}
