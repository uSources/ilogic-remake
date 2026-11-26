import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/compat';
import type { Anchor } from '../vm/common';
import { placeCallout, type CalloutPlacement } from './placement';
import { scaled, zoom } from './uiScale';

/** El color del tallo (y, en rojo, el borde de la ficha): dorado (lo tuyo, lo que eliges) o rojo (un enemigo). */
export type CalloutTone = 'gold' | 'enemy';

interface CalloutProps {
  /** La casilla de la que sale (px de pantalla). */
  anchor: Anchor;
  /** Lo que no tapa si cabe en otro sitio (px de pantalla): los enemigos a tiro. */
  avoid?: readonly Anchor[];
  tone?: CalloutTone;
  class?: string;
  label?: string;
  children: ComponentChildren;
}

/** Lo mismo de antes (si no, otro pintado): tambien el tallo, que sigue a la casilla aunque la ficha no se mueva (pegada al borde). */
const samePlace = (a: CalloutPlacement, b: CalloutPlacement): boolean =>
  a.left === b.left &&
  a.top === b.top &&
  a.side === b.side &&
  a.vertical === b.vertical &&
  a.stem.x === b.stem.x &&
  a.stem.top === b.stem.top &&
  a.stem.height === b.stem.height;

/**
 * El bocadillo con tallo (lienzo «Lo que sale de las casillas», A): un tallo sube de lo alto de la
 * casilla y en su punta se abre una ficha oscura, hacia el lado que quepa (placement.ts,
 * `placeCallout`). Se mide en cada pintado (su tamaño cambia); hasta entonces, fuera de la vista.
 * Siempre se ve de que casilla sale, aunque la ficha se aparte para no tapar.
 */
export function Callout({ anchor, avoid = [], tone = 'gold', class: cls = '', label, children }: CalloutProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CalloutPlacement | null>(null);
  const tile = scaled(anchor);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const size = { width: box.offsetWidth, height: box.offsetHeight };
    const screen = { width: window.innerWidth / zoom(), height: window.innerHeight / zoom() };
    const next = placeCallout(tile, size, screen, avoid.map(scaled));
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
        role="dialog"
        aria-label={label}
        style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0, visibility: 'hidden' }}
      >
        {children}
      </div>
    </>
  );
}
