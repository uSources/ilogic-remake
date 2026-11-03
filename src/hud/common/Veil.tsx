import type { ComponentChildren } from 'preact';

/**
 * Fondo de un dialogo: pulsar en el propio fondo (fuera del cuadro) lo cierra.
 * - `help-veil` (ayuda, novedades, nombre de escuadra): cierra al bajar el dedo o el boton.
 * - `veil` (opciones, pausa): cierra con el clic completo.
 */
export function Veil({ kind, onClose, children }: { kind: 'help-veil' | 'veil'; onClose: () => void; children: ComponentChildren }) {
  const outside = (e: Event) => e.target === e.currentTarget && onClose();
  return kind === 'veil' ? (
    <div class="veil" onClick={outside}>
      {children}
    </div>
  ) : (
    <div class="help-veil" onPointerDown={outside}>
      {children}
    </div>
  );
}
