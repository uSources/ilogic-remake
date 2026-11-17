import { describe, expect, it } from 'vitest';
import { outlineSides } from '../src/view3d/engine/fx/tileOutline';

/** El borde claro del alcance azul va solo por fuera del area, no en cada casilla. */

describe('el contorno de un grupo de casillas', () => {
  it('una casilla sola: sus cuatro lados', () => {
    expect(
      outlineSides([{ x: 3, y: 3 }])
        .map((side) => side.side)
        .sort(),
    ).toEqual(['east', 'north', 'south', 'west']);
  });

  it('dos juntas: seis lados, ninguno entre ellas', () => {
    const sides = outlineSides([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
    expect(sides).toHaveLength(6);
    expect(sides).not.toContainEqual({ pos: { x: 3, y: 3 }, side: 'east' });
    expect(sides).not.toContainEqual({ pos: { x: 4, y: 3 }, side: 'west' });
  });

  it('un cuadrado de 3 x 3: la del centro no tiene borde, el perimetro son 12 lados', () => {
    const tiles = [0, 1, 2].flatMap((x) => [0, 1, 2].map((y) => ({ x, y })));
    const sides = outlineSides(tiles);
    expect(sides).toHaveLength(12);
    expect(sides.filter((side) => side.pos.x === 1 && side.pos.y === 1)).toEqual([]);
  });

  it('sin casillas, sin borde', () => {
    expect(outlineSides([])).toEqual([]);
  });
});
