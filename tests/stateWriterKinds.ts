/**
 * Un ejemplo de cada forma de cambiar la partida que tiene que ver tests/stateWriters.ts (lo prueba
 * tests/lintImports.test.ts), y una funcion que solo mira, que no tiene que salir. No lo usa nada mas.
 */
import type { GameState, Squad, Unit } from '@core/model';

/** Asignar un campo de la partida. */
export function writesDirectly(s: GameState): void {
  s.day = 1;
}

/** A traves de otra funcion que la cambia. */
export function writesThroughHelper(s: GameState): void {
  writesDirectly(s);
}

/** En un campo guardado en una variable. */
export function writesThroughAlias(s: GameState): void {
  const units = s.units;
  units.push(units[0]!);
}

/** Con Object.assign. */
export function writesWithAssign(s: GameState): void {
  Object.assign(s, { day: 2 });
}

/** Con Reflect.set. */
export function writesWithReflect(s: GameState): void {
  Reflect.set(s, 'day', 3);
}

/** Con Object.defineProperty. */
export function writesWithDefineProperty(s: GameState): void {
  Object.defineProperty(s, 'day', { value: 4 });
}

/** Vaciando una lista de la partida con `length`. */
export function writesLength(s: GameState): void {
  s.units.length = 0;
}

/** En un parametro de un tipo de la partida (aunque no se sepa de donde viene). */
export function writesParameter(squad: Squad, units: Unit[]): void {
  Object.assign(squad, { name: 'x' });
  units.length = 0;
}

/** Solo mira: no tiene que salir. */
export function onlyReads(s: GameState, unit: Unit): number {
  const units = s.units;
  return units.filter((other) => other.team === unit.team).length + s.day;
}
