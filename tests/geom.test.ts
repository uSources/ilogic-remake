import { describe, expect, it } from 'vitest';
import { rangePos, rangeSize } from '@core/geom';

describe('geometria', () => {
  it('rangeSize coincide con el original', () => {
    expect([0, 1, 2, 3, 10].map(rangeSize)).toEqual([1, 5, 13, 25, 221]);
  });
  it('rangePos recorre el rombo en el orden del original', () => {
    const c = { x: 10, y: 10 };
    const ring1 = [1, 2, 3, 4].map((i) => rangePos(c, i));
    expect(ring1).toEqual([
      { x: 10, y: 11 },
      { x: 11, y: 10 },
      { x: 10, y: 9 },
      { x: 9, y: 10 },
    ]);
    const ring2 = [5, 6, 7, 8, 9, 10, 11, 12].map((i) => rangePos(c, i));
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
      const p = rangePos(c, i)!;
      seen.add(`${p.x},${p.y}`);
      expect(Math.abs(p.x - c.x) + Math.abs(p.y - c.y)).toBeLessThanOrEqual(6);
    }
    expect(seen.size).toBe(rangeSize(6));
  });
  it('fuera del mapa devuelve null', () => {
    expect(rangePos({ x: 0, y: 0 }, 4)).toBeNull();
  });
});
