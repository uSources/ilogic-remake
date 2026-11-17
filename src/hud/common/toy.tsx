/**
 * Las piezas de la interfaz "caja de juguete" (docs/ESTETICA.md, "Interfaz"): con ellas se montan las
 * esquinas de la partida, las fichas junto a una unidad, la rueda, la compra y las chapas que flotan
 * sobre una casilla. Estilo en styles/base/toy.css.
 */
import type { ComponentChildren, JSX } from 'preact';
import type { Anchor } from '../vm/common';
import { Button } from './buttons';
import { Icon } from './Icon';
import { scaled } from './Popover';

/** De quien es el color de una ficha: lo propio (azul), lo enemigo (rojo) o neutro (crema). */
export type ChipTone = 'own' | 'enemy' | 'plain';

/** Pastilla de esquina: lo que se ve siempre (dinero, dia). Lo de dentro lo pone quien la usa. */
export function Pill({
  cls = '',
  children,
  ...events
}: { cls?: string; children: ComponentChildren } & JSX.HTMLAttributes<HTMLDivElement>) {
  return (
    <div class={`pill ${cls}`} {...events}>
      {children}
    </div>
  );
}

/**
 * Ficha redonda que se pulsa: un icono (o un texto corto), su nombre al pasar el raton y, si hace
 * falta, un numero en la esquina. `size: 'lg'` para la que importa (fin del turno).
 */
export function Chip(props: {
  label: string;
  icon?: string | null;
  text?: string;
  badge?: number | string | null;
  tone?: ChipTone;
  size?: 'md' | 'lg';
  cls?: string;
  disabled?: boolean;
  children?: ComponentChildren;
  onClick: () => void;
}) {
  const { label, icon, text, badge, tone = 'plain', size = 'md', cls = '', disabled, children, onClick } = props;
  return (
    <Button class={`chip ${tone} ${size} ${cls}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      {icon && <Icon k={icon} alt="" cls="px-icon chip-icon" />}
      {text && <span class="chip-text">{text}</span>}
      {children}
      {badge !== null && badge !== undefined && <span class="chip-badge num">{badge}</span>}
    </Button>
  );
}

/** El color de una chapa: crema, dorada o roja. */
export type BadgeTone = 'plain' | 'gold' | 'danger';

/**
 * Chapa que flota encima de una casilla (o a sus pies, con `below`), centrada: un numero que se lee de
 * un vistazo, como el daño de un ataque. No se pulsa: el raton pasa a traves.
 */
export function Badge(props: {
  anchor: Anchor;
  tone?: BadgeTone;
  label: string;
  cls?: string;
  below?: boolean;
  children: ComponentChildren;
}) {
  const { anchor, tone = 'plain', label, cls = '', below = false, children } = props;
  const tile = scaled(anchor);
  // Encima de la casilla o, con `below`, a sus pies (sin tapar lo que hay en ella).
  const top = below ? tile.y + tile.h : tile.y;
  return (
    <div
      class={`toy-badge ${tone} ${cls} ${below ? 'below' : ''}`}
      role="status"
      aria-label={label}
      style={{ left: tile.x + tile.w / 2, top }}
    >
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
