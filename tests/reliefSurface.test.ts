import { describe, expect, it } from 'vitest';
import { buildRelief } from '../src/view3d/engine/terrain/relief';
import type { ReliefMap, ReliefStyle } from '../src/view3d/engine/terrain/reliefGrid';

/** Lo alto del relieve en cualquier punto (por el que ruedan las bolas del desierto), no solo en el centro de las casillas. */

describe('lo alto de las dunas en un punto', () => {
  const dunes: ReliefStyle = { shape: 'dunes', bands: [{ from: 0, color: 0xf2c66e }] };
  const ground = 0.25;
  const sand: ReliefMap = {
    width: 8,
    height: 8,
    tiles: Array.from({ length: 64 }, (_, index) => ({ pos: { x: index % 8, y: Math.floor(index / 8) }, style: dunes })),
    groundAt: () => ground,
    canSpill: () => false,
    spillRestsOnGround: true,
  };
  const relief = buildRelief(sand);
  /** De punta a punta del mapa por el medio, a pasos de media subcasilla. */
  const across = Array.from({ length: 8 * 16 }, (_, step) => relief.surfaceAt(step / 16 - 0.5, 3.5));

  it('sube y baja con las crestas, sin salirse de lo que miden', () => {
    const heights = across.filter((height): height is number => height !== null);
    expect(heights).toHaveLength(across.length);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(ground);
    expect(Math.max(...heights)).toBeLessThanOrEqual(ground + 0.25);
    expect(new Set(heights).size).toBeGreaterThan(2);
  });

  it('en el centro de una casilla es lo de su centro (donde se pone lo que hay encima), o casi', () => {
    const center = { x: 4, y: 4 };
    const height = relief.surfaceAt(center.x, center.y)!;
    expect(height).toBeLessThanOrEqual(relief.topAt(center));
    expect(height).toBeGreaterThan(relief.topAt(center) - 0.1);
  });

  it('fuera del relieve no hay: ahi manda el suelo de la casilla', () => {
    expect(relief.surfaceAt(-3, 2)).toBeNull();
    expect(relief.surfaceAt(20, 2)).toBeNull();
  });
});
