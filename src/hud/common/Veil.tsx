import type { ComponentChildren } from 'preact';

/**
 * Fondo de un dialogo: pulsar en el propio fondo (fuera del cuadro) lo cierra.
 * - `help-veil` (ayuda, novedades, nombre de escuadra): cierra al bajar el dedo o el boton.
 * - `veil` (opciones, pausa): cierra con el clic completo.
 * `cls`: su forma, si no es la de siempre (la pausa: el tablero desenfocado y lo suyo a la izquierda).
 */
export function Veil({
  kind,
  cls,
  onClose,
  children,
}: {
  kind: 'help-veil' | 'veil';
  cls?: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const closeIfOutside = (event: Event) => event.target === event.currentTarget && onClose();
  return kind === 'veil' ? (
    <div class={`veil ${cls ?? ''}`} onClick={closeIfOutside}>
      {children}
    </div>
  ) : (
    <div class="help-veil" onPointerDown={closeIfOutside}>
      {children}
    </div>
  );
}
