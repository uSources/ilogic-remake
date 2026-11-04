/**
 * Abastecimiento: reparar a las unidades aliadas de al lado (Suministros).
 */
import { MAX_LIFE, UNIT_HEALS } from '../data';
import { neighbors4 } from '../geom';
import { mapGrid } from '../mapGrid';
import type { GameState, Unit } from '../model';
import { unitAt } from './queries';

/** Vida que `supplier` le cura a `patient` cada vez (units.json, "heals"). */
function healAmount(supplier: Unit, patient: Unit): number {
  return UNIT_HEALS[supplier.type]![patient.type]!;
}

function canSupplyTo(supplier: Unit, patient: Unit): boolean {
  return healAmount(supplier, patient) > 0 && patient.life < MAX_LIFE;
}

/** Aliadas de al lado a las que `supplier` puede reparar ahora, en el orden de las vecinas. */
function patientsOf(s: GameState, supplier: Unit): Unit[] {
  return neighbors4(mapGrid(s), supplier)
    .map((pos) => unitAt(s, pos))
    .filter((other): other is Unit => !!other && other.team === supplier.team && canSupplyTo(supplier, other));
}

/** Hay alguna unidad aliada al lado a la que reparar (en la practica solo Suministros). */
export function canSupply(s: GameState, supplier: Unit): boolean {
  return patientsOf(s, supplier).length > 0;
}

/**
 * Reparar (Unit.Heal sobre las 4 vecinas): cura lo que diga "heals" en units.json.
 * [CAMBIO] antes tambien llenaba combustible y municion; se quitaron del juego.
 */
export function supply(s: GameState, supplier: Unit): number {
  const patients = patientsOf(s, supplier);
  for (const patient of patients) patient.life = Math.min(MAX_LIFE, patient.life + healAmount(supplier, patient));
  supplier.active = false;
  supplier.canMove = false;
  return patients.length;
}
