import { describe, expect, it } from 'vitest';
import { Grid, isInside } from '@core/util/grid';
import { compareKeys, maxBy, minBy } from '@core/util/pick';

describe('rejillas', () => {
  it('lee y escribe por posicion', () => {
    const grid = Grid.wrap([
      [1, 2],
      [3, 4],
    ]);
    grid.set({ x: 1, y: 0 }, 9);
    expect(grid.at({ x: 1, y: 0 })).toBe(9);
    expect(grid.at({ x: 0, y: 1 })).toBe(2);
    expect(grid.columns[1]![0]).toBe(9); // wrap no copia: escribe en las columnas de siempre
  });

  it('recorre columna a columna, como los bucles de siempre', () => {
    const grid = Grid.wrap([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect([...grid.cells()].map(({ pos, value }) => `${pos.x}${pos.y}${value}`)).toEqual(['00a', '01b', '10c', '11d']);
    const visited: string[] = [];
    grid.forEach((value, pos) => visited.push(`${pos.x}${pos.y}${value}`));
    expect(visited).toEqual(['00a', '01b', '10c', '11d']);
  });

  it('sabe su tamaño, si una casilla cae dentro y crea capas del mismo tamaño', () => {
    const grid = Grid.filled({ width: 3, height: 2 }, 0);
    expect([grid.width, grid.height]).toEqual([3, 2]);
    expect(grid.contains({ x: 2, y: 1 })).toBe(true);
    expect(grid.contains({ x: 3, y: 0 })).toBe(false);
    expect(grid.contains({ x: 0, y: -1 })).toBe(false);
    expect(isInside({ width: 3, height: 2 }, { x: 1, y: 2 })).toBe(false);
    const layer = grid.createLayer(true);
    expect([layer.width, layer.height, layer.at({ x: 2, y: 1 })]).toEqual([3, 2, true]);
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
