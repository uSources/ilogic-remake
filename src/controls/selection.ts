/**
 * [CAMBIO] Seleccion de unidades como en los juegos de estrategia en tiempo real (StarCraft, Age of
 * Empires, Total War). Logica pura: recibe lo que ha pasado (clic, doble clic, recuadro, tecla de
 * grupo) y devuelve la seleccion nueva. No sabe de raton, dedo ni teclado: el adaptador de cada
 * mando decide el gesto y GameScene aplica el resultado (tests/selection.test.ts).
 *
 * - Clic en una unidad propia: solo esa.
 * - Mayusculas + clic: la añade o la quita.
 * - Doble clic o Ctrl + clic: todas las de ese tipo que se ven en pantalla (con Mayusculas, se añaden).
 * - Recuadro: las de dentro (con Mayusculas o Ctrl, se añaden a las que habia).
 * - Clic en vacio: no queda ninguna (con Mayusculas, no cambia nada).
 */
import type { Unit } from '../core/model';

export type Selection = ReadonlySet<number>;

export const EMPTY: Selection = new Set<number>();

/** Teclas y veces del clic (ver TapInfo en pointer.ts). */
export interface ClickMods {
  shift: boolean;
  ctrl: boolean;
  count: number;
}

/**
 * Seleccion tras un clic. `hit`: la unidad propia elegible de debajo (o null). `sameType`: las
 * elegibles del mismo tipo que se ven en pantalla (solo se llama con doble clic o Ctrl + clic).
 */
export function clickSelect(current: Selection, hit: Unit | null, mods: ClickMods, sameType: (unit: Unit) => readonly Unit[]): Selection {
  if (!hit) return mods.shift ? current : EMPTY;
  if (mods.count >= 2 || mods.ctrl) {
    const all = sameType(hit).map((unit) => unit.uid);
    return mods.shift ? new Set([...current, ...all]) : new Set(all);
  }
  if (mods.shift) {
    const next = new Set(current);
    if (next.has(hit.uid)) next.delete(hit.uid);
    else next.add(hit.uid);
    return next;
  }
  return new Set([hit.uid]);
}

/** Seleccion tras un recuadro con estas unidades dentro. `add`: Mayusculas o Ctrl (se suman). */
export function boxSelect(current: Selection, inside: readonly Unit[], add: boolean): Selection {
  const ids = inside.map((unit) => unit.uid);
  return add ? new Set([...current, ...ids]) : new Set(ids);
}

/** Quitar de la seleccion las que ya no se pueden elegir (muertas, cargadas en un transporte...). */
export function pruneSelection(current: Selection, canSelect: (uid: number) => boolean): Selection {
  const next = [...current].filter(canSelect);
  return next.length === current.size ? current : new Set(next);
}

export const sameSelection = (firstSelection: Selection, secondSelection: Selection): boolean =>
  firstSelection.size === secondSelection.size && [...firstSelection].every((id) => secondSelection.has(id));
