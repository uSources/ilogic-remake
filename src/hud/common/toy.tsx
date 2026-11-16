/**
 * Las piezas de la interfaz "caja de juguete" (docs/ESTETICA.md, "Interfaz"): con ellas se montan las
 * esquinas de la partida, las fichas junto a una unidad, la rueda y la compra. Estilo en
 * styles/base/toy.css.
 */
import type { ComponentChildren, JSX } from 'preact';
import { Button } from './buttons';
import { Icon } from './Icon';

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
