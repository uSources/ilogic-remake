import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/compat';
import { settings } from '../../settings';
import type { Anchor } from '../vm/common';
import { placeBeside, type Placement } from './placement';

/** Con la interfaz ampliada (zoom en #hud), las coordenadas de pantalla se dividen por la escala. */
export const zoom = () => settings.uiScale || 1;
export function scaled(anchor: Anchor): Anchor {
  const scale = zoom();
  return { x: anchor.x / scale, y: anchor.y / scale, w: anchor.w / scale, h: anchor.h / scale };
}

/**
 * Bocadillo junto a la casilla `anchor`: al lado que se prefiera si cabe, si no al otro, y si no
 * cabe a ninguno (pantalla estrecha), encima o debajo (ver placement.ts). Se mide en cada pintado
 * (su tamaño cambia); hasta entonces, fuera de la vista.
 */
export function Popover(props: { anchor: Anchor; prefer: 'right' | 'left'; class: string; children: ComponentChildren; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const anchor = scaled(props.anchor);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const size = { width: box.offsetWidth, height: box.offsetHeight };
    const screen = { width: window.innerWidth / zoom(), height: window.innerHeight / zoom() };
    const next = placeBeside(anchor, size, screen, props.prefer);
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
