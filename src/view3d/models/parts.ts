/**
 * Piezas que se repiten entre modelos (un soldado, unas cadenas, una rueda): funciones que devuelven
 * bloques ya colocados. Asi un modelo nuevo se escribe con las piezas, no bloque a bloque.
 */
import type { Block, BlockPaint } from '../blocks';

export type Spot = readonly [x: number, z: number];

/** Lo que lleva un soldado en las manos. */
export type Gear = 'rifle' | 'bazooka' | 'shield' | 'none';

const GEAR: Readonly<Record<Gear, (x: number, z: number) => Block[]>> = {
  rifle: (x, z) => [{ size: [0.03, 0.03, 0.2], at: [x + 0.08, 0.17, z + 0.06], paint: 'dark' }],
  bazooka: (x, z) => [{ size: [0.06, 0.06, 0.3], at: [x + 0.08, 0.25, z], paint: 'teamDark' }],
  shield: (x, z) => [{ size: [0.18, 0.22, 0.03], at: [x, 0.06, z + 0.09], paint: 'metal' }],
  none: () => [],
};

/** Un soldado de juguete en (x, z): piernas, cuerpo del equipo, cara y casco. */
export function trooper([x, z]: Spot, gear: Gear = 'rifle'): Block[] {
  return [
    { size: [0.11, 0.1, 0.08], at: [x, 0, z], paint: 'dark' },
    { size: [0.15, 0.14, 0.1], at: [x, 0.1, z], paint: 'team' },
    { size: [0.1, 0.09, 0.09], at: [x, 0.24, z], paint: 'skin' },
    { size: [0.12, 0.04, 0.12], at: [x, 0.32, z], paint: 'teamDark' },
    ...GEAR[gear](x, z),
  ];
}

/** Dos cadenas de oruga a los lados, de ese ancho total y ese largo. */
export function tracks(width: number, length: number, height = 0.16): Block[] {
  const side = width / 2 - 0.09;
  return [-side, side].map((x): Block => ({ size: [0.18, height, length], at: [x, 0, 0], paint: 'dark' }));
}

/** Cuatro ruedas en las esquinas de un vehiculo de ese ancho y largo. */
export function wheels(width: number, length: number, size = 0.16): Block[] {
  const corners: Spot[] = [
    [-width / 2, -length / 3],
    [width / 2, -length / 3],
    [-width / 2, length / 3],
    [width / 2, length / 3],
  ];
  return corners.map(([x, z]): Block => ({ size: [0.08, size, size], at: [x, 0, z], paint: 'dark' }));
}

/** Una caja (un bulto, una caja de suministros). */
export const crate = ([x, z]: Spot, y: number, size: number, paint: BlockPaint = 'wood'): Block => ({
  size: [size, size, size],
  at: [x, y, z],
  paint,
});

/** Los mismos bloques, subidos `height` (un soldado montado en una moto). */
export const lifted = (blocks: readonly Block[], height: number): Block[] =>
  blocks.map((block) => ({ ...block, at: [block.at[0], block.at[1] + height, block.at[2]] }));
