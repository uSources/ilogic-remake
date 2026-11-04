import { describe, expect, it } from 'vitest';
import { neighbors4, posKey, rangePos, rangeSize, squareArea } from '@core/geom';
import { Grid } from '@core/util/grid';

/** Un mapa de 32x32, como el original. */
const MAP = Grid.filled({ width: 32, height: 32 }, 0);

describe('geometria', () => {
  it('rangeSize coincide con el original', () => {
    expect([0, 1, 2, 3, 10].map(rangeSize)).toEqual([1, 5, 13, 25, 221]);
  });
  it('rangePos recorre el rombo en el orden del original', () => {
    const c = { x: 10, y: 10 };
    const ring1 = [1, 2, 3, 4].map((i) => rangePos(MAP, c, i));
    expect(ring1).toEqual([
      { x: 10, y: 11 },
      { x: 11, y: 10 },
      { x: 10, y: 9 },
      { x: 9, y: 10 },
    ]);
    const ring2 = [5, 6, 7, 8, 9, 10, 11, 12].map((i) => rangePos(MAP, c, i));
    expect(ring2).toEqual([
      { x: 10, y: 12 },
      { x: 11, y: 11 },
      { x: 12, y: 10 },
      { x: 11, y: 9 },
      { x: 10, y: 8 },
      { x: 9, y: 9 },
      { x: 8, y: 10 },
      { x: 9, y: 11 },
    ]);
  });
  it('cada casilla del rombo aparece una vez y a la distancia correcta', () => {
    const c = { x: 15, y: 15 };
    const seen = new Set<string>();
    for (let i = 0; i < rangeSize(6); i++) {
      const p = rangePos(MAP, c, i)!;
      seen.add(`${p.x},${p.y}`);
      expect(Math.abs(p.x - c.x) + Math.abs(p.y - c.y)).toBeLessThanOrEqual(6);
    }
    expect(seen.size).toBe(rangeSize(6));
  });
  it('fuera del mapa devuelve null', () => {
    expect(rangePos(MAP, { x: 0, y: 0 }, 4)).toBeNull();
    expect(rangePos(Grid.filled({ width: 10, height: 10 }, 0), { x: 9, y: 9 }, 1)).toBeNull();
  });
  it('las vecinas dependen del tamaño del mapa que se pasa', () => {
    expect(neighbors4(MAP, { x: 9, y: 9 })).toHaveLength(4);
    expect(neighbors4(Grid.filled({ width: 10, height: 10 }, 0), { x: 9, y: 9 })).toEqual([
      { x: 9, y: 8 },
      { x: 8, y: 9 },
    ]);
  });
  it('area cuadrada y clave de casilla', () => {
    expect(squareArea({ x: 0, y: 0 }, 1)).toHaveLength(9);
    expect(squareArea({ x: 5, y: 5 }, 0)).toEqual([{ x: 5, y: 5 }]);
    expect(posKey({ x: 3, y: 7 })).toBe('3,7');
  });
});
