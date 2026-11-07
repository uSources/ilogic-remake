import { describe, expect, it } from 'vitest';
import { Grid } from '@core/util/grid';
import { compareKeys, maxBy, minBy } from '@core/util/pick';
import { pick, seededRng, weightedPick } from '@core/util/random';

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
    expect(grid.contains({ x: 1, y: 2 })).toBe(false);
    expect(grid.atClamped({ x: -4, y: 9 })).toBe(grid.at({ x: 0, y: 1 }));
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
    expect(maxBy([1, 3, 3, 2], (value) => value)).toBe(3);
    expect(maxBy(['x', 'yy', 'zz'], (word) => word.length)).toBe('yy');
  });
});

describe('elegir al azar (util/random.ts)', () => {
  it('pick: uno cualquiera, y con la lista vacia ni tira', () => {
    let draws = 0;
    const counted = () => {
      draws++;
      return 0.99;
    };
    expect(pick(['a', 'b', 'c'], counted)).toBe('c');
    expect(pick([], counted)).toBeUndefined();
    expect(draws).toBe(1);
  });

  it('weightedPick: proporcional al peso (lo que no pesa no sale), y la misma semilla da lo mismo', () => {
    const rng = seededRng(7);
    const picks = Array.from({ length: 200 }, () =>
      weightedPick(['nada', 'poco', 'mucho'], (item) => ({ nada: 0, poco: 1, mucho: 9 })[item] ?? 0, rng),
    );
    expect(picks).not.toContain('nada');
    expect(picks.filter((item) => item === 'mucho').length).toBeGreaterThan(picks.filter((item) => item === 'poco').length * 3);
    expect(weightedPick([], () => 1, rng)).toBeUndefined();
    expect(weightedPick(['x', 'y'], () => 1, seededRng(3))).toBe(weightedPick(['x', 'y'], () => 1, seededRng(3)));
  });
});
