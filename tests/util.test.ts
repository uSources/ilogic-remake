import { describe, expect, it } from 'vitest';
import { cellAt, cells, setCell } from '@core/util/grid';
import { compareKeys, maxBy, minBy } from '@core/util/pick';

describe('rejillas', () => {
  it('lee y escribe por posicion', () => {
    const grid = [
      [1, 2],
      [3, 4],
    ];
    setCell(grid, { x: 1, y: 0 }, 9);
    expect(cellAt(grid, { x: 1, y: 0 })).toBe(9);
    expect(cellAt(grid, { x: 0, y: 1 })).toBe(2);
  });

  it('recorre columna a columna, como los bucles de siempre', () => {
    const grid = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    expect([...cells(grid)].map(({ pos, value }) => `${pos.x}${pos.y}${value}`)).toEqual(['00a', '01b', '10c', '11d']);
  });
});

describe('elegir el mejor', () => {
  it('compara criterios en orden y sin restar (Infinity empata con Infinity)', () => {
    expect(compareKeys([1, 5], [2, 0])).toBe(-1);
    expect(compareKeys([2, 5], [2, 3])).toBe(1);
    expect(compareKeys(Infinity, Infinity)).toBe(0);
  });

  it('minBy se queda con el primero si empatan', () => {
    const items = [
      { id: 'a', distance: 3, cost: 2 },
      { id: 'b', distance: 1, cost: 4 },
      { id: 'c', distance: 1, cost: 1 },
      { id: 'd', distance: 1, cost: 1 },
    ];
    expect(minBy(items, (item) => [item.distance, item.cost])?.id).toBe('c');
    expect(minBy([], () => 0)).toBeNull();
  });

  it('maxBy se queda con el primero si empatan', () => {
    expect(maxBy([1, 3, 3, 2], (n) => n)).toBe(3);
    expect(maxBy(['x', 'yy', 'zz'], (word) => word.length)).toBe('yy');
  });
});
