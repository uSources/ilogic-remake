import type { ButtonHTMLAttributes, ComponentChildren } from 'preact';

/** Evitar que los botones se queden con el foco (Enter los pulsaria ademas de la accion del juego). */
export const noFocus = (e: MouseEvent) => e.preventDefault();

/**
 * Funcion `ref` que lleva el elemento a la vista (lo justo) si `on`. Es nueva en cada pintado a
 * proposito: asi el elegido vuelve a la vista cada vez que se repinta la lista, como siempre.
 */
export const scrollRef = (on: boolean | undefined) => (el: HTMLElement | null) => {
  if (el && on) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
};

/**
 * Boton de la interfaz: sin foco del navegador (el foco lo lleva la escena, con el teclado) y que no
 * envia formularios. `scrollTo`: llevarlo a la vista (el elegido de una lista con scroll).
 */
export function Button({ scrollTo, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { scrollTo?: boolean }) {
  return (
    <button tabIndex={-1} type="button" onMouseDown={noFocus} ref={scrollTo === undefined ? undefined : scrollRef(scrollTo)} {...props} />
  );
}

/** Boton de los menus: elegido con `sel` (teclado o raton), pasar el raton lo elige y pulsarlo lo usa. */
export function Btn(props: {
  sel?: boolean;
  cls?: string;
  disabled?: boolean;
  onHover?: () => void;
  onPick: () => void;
  children: ComponentChildren;
  label?: string;
}) {
  return (
    <Button
      class={`${props.cls ?? 'px-btn'} ${props.sel ? 'sel' : ''}`}
      disabled={props.disabled}
      aria-label={props.label}
      onMouseEnter={props.onHover}
      onClick={props.onPick}
      scrollTo={!!props.sel}
    >
      {props.children}
    </Button>
  );
}
