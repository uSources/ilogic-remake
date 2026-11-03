/**
 * Abastecimiento: reparar a las unidades aliadas de al lado (Suministros).
 */
import { MAX_LIFE, UNIT_HEALS } from '../data';
import { neighbors4 } from '../geom';
import type { GameState, Unit } from '../types';
import { unitAt } from './queries';

function canSupplyTo(u: Unit, o: Unit): boolean {
  return UNIT_HEALS[u.type]![o.type]! > 0 && o.life < MAX_LIFE;
}

/** Hay alguna unidad aliada al lado a la que reparar (en la practica solo Suministros). */
export function canSupply(s: GameState, u: Unit): boolean {
  return neighbors4(u).some((p) => {
    const o = unitAt(s, p.x, p.y);
    return !!o && o.team === u.team && canSupplyTo(u, o);
  });
}

/**
 * Reparar (Unit.Heal sobre las 4 vecinas): cura lo que diga "heals" en units.json.
 * [CAMBIO] antes tambien llenaba combustible y municion; se quitaron del juego.
 */
export function supply(s: GameState, u: Unit): number {
  let n = 0;
  for (const p of neighbors4(u)) {
    const o = unitAt(s, p.x, p.y);
    if (!o || o.team !== u.team || !canSupplyTo(u, o)) continue;
    o.life = Math.min(MAX_LIFE, o.life + UNIT_HEALS[u.type]![o.type]!);
    n++;
  }
  u.active = false;
  u.canMove = false;
  return n;
}
