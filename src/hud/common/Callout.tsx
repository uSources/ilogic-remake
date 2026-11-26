import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/compat';
import type { Anchor } from '../vm/common';
import { placeCallout, type CalloutPlacement } from './placement';
import { scaled, zoom } from './Popover';

/** El color del tallo y del borde: dorado (lo tuyo, lo que eliges) o rojo (un enemigo). */
export type CalloutTone = 'gold' | 'enemy';

interface CalloutProps {
  /** La casilla de la que sale (px de pantalla). */
  anchor: Anchor;
  tone?: CalloutTone;
  class?: string;
  label?: string;
  role?: 'dialog' | 'menu';
  children: ComponentChildren;
}

const samePlace = (a: CalloutPlacement, b: CalloutPlacement): boolean =>
  a.left === b.left && a.top === b.top && a.side === b.side && a.vertical === b.vertical && a.stem.height === b.stem.height;

/**
 * El bocadillo con tallo (lienzo «Lo que sale de las casillas», A): un tallo sube de lo alto de la
 * casilla y en su punta se abre una ficha oscura, hacia el lado que quepa (placement.ts,
 * `placeCallout`). Se mide en cada pintado (su tamaño cambia); hasta entonces, fuera de la vista.
 * Siempre se ve de que casilla sale, aunque la ficha se aparte para no tapar.
 */
export function Callout({ anchor, tone = 'gold', class: cls = '', label, role = 'dialog', children }: CalloutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CalloutPlacement | null>(null);
  const tile = scaled(anchor);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const size = { width: box.offsetWidth, height: box.offsetHeight };
    const screen = { width: window.innerWidth / zoom(), height: window.innerHeight / zoom() };
    const next = placeCallout(tile, size, screen);
    if (!place || !samePlace(place, next)) setPlace(next);
  });
  const shape = place ? `${place.side} ${place.vertical}` : '';
  return (
    <>
      {place && (
        <div
          class={`callout-stem ${tone} ${place.vertical}`}
          aria-hidden="true"
          style={{ left: place.stem.x, top: place.stem.top, height: place.stem.height }}
        />
      )}
      <div
        ref={ref}
        class={`callout ${tone} ${shape} ${cls}`}
        role={role}
        aria-label={label}
        style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0, visibility: 'hidden' }}
      >
        {children}
      </div>
    </>
  );
}
