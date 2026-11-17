/**
 * El contorno de un grupo de casillas: los lados que no tocan otra del grupo. Asi el alcance azul lleva
 * un borde claro solo por fuera (no una rejilla en cada casilla). Cuentas de casillas, sin three.js.
 */
import type { Pos } from '../../../core/model';

/** Un lado de casilla: hacia +x (este), -x (oeste), +y (sur) o -y (norte). */
export type TileSide = 'east' | 'west' | 'south' | 'north';

export interface OutlineSide {
  readonly pos: Pos;
  readonly side: TileSide;
}

/** Hacia donde queda la casilla vecina de cada lado. */
export const SIDE_STEPS: Readonly<Record<TileSide, Pos>> = {
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
  south: { x: 0, y: 1 },
  north: { x: 0, y: -1 },
};

const SIDES = Object.keys(SIDE_STEPS) as TileSide[];
const keyOf = (pos: Pos): string => `${pos.x},${pos.y}`;

/** Los lados del borde de esas casillas (los que dan a una casilla que no es del grupo). */
export function outlineSides(tiles: readonly Pos[]): OutlineSide[] {
  const inside = new Set(tiles.map(keyOf));
  return tiles.flatMap((pos) =>
    SIDES.filter((side) => !inside.has(keyOf({ x: pos.x + SIDE_STEPS[side].x, y: pos.y + SIDE_STEPS[side].y }))).map((side) => ({
      pos,
      side,
    })),
  );
}
