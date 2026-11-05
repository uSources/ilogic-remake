/**
 * Abastecimiento: reparar a las unidades aliadas de al lado (Suministros).
 */
import { unitTypeOf } from '../gameContent';
import { MAX_LIFE } from '../data';
import { neighbors4 } from '../geom';
import { mapGrid } from '../mapGrid';
import type { GameState, Unit } from '../model';
import { unitAt } from './queries';
import { spendUnit } from './unitTurn';

/** Vida que `supplier` le cura a `patient` cada vez (units.json, "heals"). */
function healAmount(s: GameState, supplier: Unit, patient: Unit): number {
  return unitTypeOf(s, supplier).heals[unitTypeOf(s, patient).id] ?? 0;
}

function canSupplyTo(s: GameState, supplier: Unit, patient: Unit): boolean {
  return healAmount(s, supplier, patient) > 0 && patient.life < MAX_LIFE;
}

/** Aliadas de al lado a las que `supplier` puede reparar ahora, en el orden de las vecinas. */
function patientsOf(s: GameState, supplier: Unit): Unit[] {
  return neighbors4(mapGrid(s), supplier)
    .map((pos) => unitAt(s, pos))
    .filter((other): other is Unit => !!other && other.team === supplier.team && canSupplyTo(s, supplier, other));
}

/** Hay alguna unidad aliada al lado a la que reparar (en la practica solo Suministros). */
export function canSupply(s: GameState, supplier: Unit): boolean {
  return patientsOf(s, supplier).length > 0;
}

/** Lo que ha curado un abastecimiento a una unidad. */
export interface Repair {
  uid: number;
  amount: number;
}

/**
 * Reparar (Unit.Heal sobre las 4 vecinas), ya comprobado (canSupply): cura lo que diga "heals" en
 * units.json y gasta el turno de quien repara. Devuelve lo que ha curado a cada una.
 * [CAMBIO] antes tambien llenaba combustible y municion; se quitaron del juego.
 */
export function repairNeighbours(s: GameState, supplier: Unit): Repair[] {
  const repairs = patientsOf(s, supplier).map((patient) => {
    const before = patient.life;
    patient.life = Math.min(MAX_LIFE, patient.life + healAmount(s, supplier, patient));
    return { uid: patient.uid, amount: patient.life - before };
  });
  spendUnit(supplier);
  return repairs;
}
