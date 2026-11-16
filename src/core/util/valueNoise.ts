/**
 * Ruido suave de 0 a 1 sobre una rejilla: valores al azar en una red cada `spacing` casillas,
 * interpolados entre medias con una transicion suave. Lo usan las alturas (core/elevation.ts) y las
 * cordilleras del generador (mapgen/mountains.ts): el mismo `rng` da siempre el mismo ruido.
 */
import type { Rng } from '../model';
import { Grid, type GridSize } from './grid';

export function valueNoise(size: GridSize, spacing: number, rng: Rng): Grid<number> {
  const lattice = Array.from({ length: Math.ceil(size.width / spacing) + 2 }, () =>
    Array.from({ length: Math.ceil(size.height / spacing) + 2 }, () => rng()),
  );
  const noise = Grid.filled(size, 0);
  noise.forEach((_, pos) => noise.set(pos, interpolate(lattice, pos.x / spacing, pos.y / spacing)));
  return noise;
}

/** El valor entre los cuatro puntos de la red que rodean (x, y), con transicion suave. */
function interpolate(lattice: readonly (readonly number[])[], x: number, y: number): number {
  const [cellX, cellY] = [Math.floor(x), Math.floor(y)];
  const ease = (t: number) => t * t * (3 - 2 * t);
  const [u, v] = [ease(x - cellX), ease(y - cellY)];
  const at = (dx: number, dy: number) => lattice[cellX + dx]?.[cellY + dy] ?? 0;
  const top = at(0, 0) + (at(1, 0) - at(0, 0)) * u;
  const bottom = at(0, 1) + (at(1, 1) - at(0, 1)) * u;
  return top + (bottom - top) * v;
}
