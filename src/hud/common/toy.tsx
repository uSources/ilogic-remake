/**
 * Las piezas de la interfaz "caja de juguete" (docs/ESTETICA.md, "Interfaz") que quedan: la pastilla
 * (el reloj del turno por la red) y la calavera de pixel. Lo demas de la partida va ya en estilo C
 * (docs/PLAN-ESTILO-C.md). Estilo en styles/base/toy.css.
 */
import type { ComponentChildren, HTMLAttributes } from 'preact';

/** Pastilla: el reloj del turno por la red. Lo de dentro lo pone quien la usa. */
export function Pill({ cls = '', children, ...events }: { cls?: string; children: ComponentChildren } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div class={`pill ${cls}`} {...events}>
      {children}
    </div>
  );
}

/** Una calavera de pixel (8 x 8), del color del texto: «puede caer». */
const SKULL_PIXELS = ['.######.', '########', '##..#..#', '##..#..#', '########', '.##.##.#', '..#####.', '..#.#.#.'];

export function PixelSkull({ size = 16 }: { size?: number }) {
  const cells = SKULL_PIXELS.flatMap((row, y) => [...row].flatMap((cell, x) => (cell === '#' ? [{ x, y }] : [])));
  return (
    <svg class="px-skull" width={size} height={size} viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true">
      {cells.map(({ x, y }) => (
        <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
    </svg>
  );
}
