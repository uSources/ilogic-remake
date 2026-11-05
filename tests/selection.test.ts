import { describe, expect, it } from 'vitest';
import { EMPTY, boxSelect, clickSelect, pruneSelection, sameSelection } from '../src/controls/selection';
import type { Unit } from '@core/model';

/** [CAMBIO] Seleccion como en los juegos de estrategia en tiempo real (controls/selection.ts). */
const unitWith = (uid: number, type = 0) => ({ uid, type }) as Unit;
const ids = (s: ReadonlySet<number>) => [...s].sort((first, second) => first - second);
const plain = { shift: false, ctrl: false, count: 1 };
const tanks = [unitWith(1, 1), unitWith(2, 1), unitWith(5, 1)];
const sameType = (unit: Unit) => (unit.type === 1 ? tanks : [unit]);

describe('seleccion', () => {
  it('clic en una unidad: solo esa; en vacio: ninguna', () => {
    expect(ids(clickSelect(new Set([7, 8]), unitWith(3), plain, sameType))).toEqual([3]);
    expect(clickSelect(new Set([7, 8]), null, plain, sameType)).toBe(EMPTY);
  });

  it('Mayusculas + clic añade o quita; en vacio no cambia nada', () => {
    const current = new Set([7, 8]);
    expect(ids(clickSelect(current, unitWith(3), { ...plain, shift: true }, sameType))).toEqual([3, 7, 8]);
    expect(ids(clickSelect(current, unitWith(8), { ...plain, shift: true }, sameType))).toEqual([7]);
    expect(clickSelect(current, null, { ...plain, shift: true }, sameType)).toBe(current);
  });

  it('doble clic o Ctrl + clic: todas las de ese tipo en pantalla (con Mayusculas se suman)', () => {
    expect(ids(clickSelect(new Set([7]), unitWith(2, 1), { ...plain, count: 2 }, sameType))).toEqual([1, 2, 5]);
    expect(ids(clickSelect(new Set([7]), unitWith(2, 1), { ...plain, ctrl: true }, sameType))).toEqual([1, 2, 5]);
    expect(ids(clickSelect(new Set([7]), unitWith(2, 1), { ...plain, ctrl: true, shift: true }, sameType))).toEqual([1, 2, 5, 7]);
  });

  it('recuadro: las de dentro; con Mayusculas o Ctrl se suman', () => {
    expect(ids(boxSelect(new Set([7]), [unitWith(1), unitWith(2)], false))).toEqual([1, 2]);
    expect(ids(boxSelect(new Set([7]), [unitWith(1), unitWith(2)], true))).toEqual([1, 2, 7]);
    expect(boxSelect(new Set([7]), [], false).size).toBe(0);
  });

  it('quitar las que ya no valen y comparar', () => {
    const current = new Set([1, 2, 3]);
    expect(pruneSelection(current, () => true)).toBe(current);
    expect(ids(pruneSelection(current, (id) => id !== 2))).toEqual([1, 3]);
    expect(sameSelection(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(sameSelection(new Set([1, 2]), new Set([1]))).toBe(false);
  });
});
