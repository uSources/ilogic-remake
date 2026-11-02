import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/compat';
import { settings } from '../../settings';
import type { Anchor } from '../vm/common';

// ---------------------------------------------------------------------------
// Colocacion de bocadillos junto a una casilla
// ---------------------------------------------------------------------------

const MARGIN = 16;
const TOP_SAFE = 80;

/** Con la interfaz ampliada (zoom en #hud), las coordenadas de pantalla se dividen por la escala. */
export const zoom = () => settings.uiScale || 1;
export function scaled(a: Anchor): Anchor {
  const z = zoom();
  return { x: a.x / z, y: a.y / z, w: a.w / z, h: a.h / z };
}

/**
 * Bocadillo junto a la casilla `anchor`: al lado que se prefiera si cabe, si no al otro, y si no
 * cabe a ninguno (pantalla estrecha), encima o debajo. Se mide en cada pintado (su tamaño cambia).
 */
export function Popover(props: { anchor: Anchor; prefer: 'right' | 'left'; class: string; children: ComponentChildren; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { prefer } = props;
  const anchor = scaled(props.anchor);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const vw = window.innerWidth / zoom(),
      vh = window.innerHeight / zoom();
    const gap = 10;
    const rightX = anchor.x + anchor.w + gap;
    const leftX = anchor.x - gap - w;
    const fitsRight = rightX + w <= vw - MARGIN;
    const fitsLeft = leftX >= MARGIN;
    let left: number;
    if (prefer === 'right') left = fitsRight || !fitsLeft ? rightX : leftX;
    else left = fitsLeft || !fitsRight ? leftX : rightX;
    let top = anchor.y + anchor.h / 2 - h / 2;
    // Si no cabe a ningun lado (pantalla estrecha), debajo o encima de la casilla.
    if (!fitsRight && !fitsLeft) {
      left = anchor.x + anchor.w / 2 - w / 2;
      top = anchor.y + anchor.h + gap + h <= vh - MARGIN ? anchor.y + anchor.h + gap : anchor.y - gap - h;
    }
    left = Math.max(MARGIN, Math.min(vw - MARGIN - w, left));
    top = Math.max(Math.min(TOP_SAFE, vh - h - MARGIN), Math.min(vh - MARGIN - h, top));
    const next = { left: Math.round(left), top: Math.round(top) };
    if (!pos || pos.left !== next.left || pos.top !== next.top) setPos(next);
  });
  return (
    <div
      ref={ref}
      class={`px ${props.class}`}
      role="dialog"
      aria-label={props.label}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      {props.children}
    </div>
  );
}
