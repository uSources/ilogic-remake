import type { ComponentChildren } from 'preact';

interface MenuScreenProps {
  /** La clase de la pantalla (su forma por dentro). */
  cls: string;
  /** Lo pequeño de arriba, en oro («Nueva partida», «1 de 6 hechas»). */
  kicker: string;
  title: string;
  /** Las teclas, abajo (con el dedo no salen). */
  hint: string;
  /** La ficha oscura de la derecha: el mapa, la mision elegida. */
  card: ComponentChildren;
  /** La lista de texto. */
  children: ComponentChildren;
}

/**
 * Una pantalla del menu clasico (Escaramuza, Campaña), como la pausa: a la izquierda lo que se elige,
 * con su titulo en grande y la lista de texto; a la derecha, en su ficha, lo que se va a jugar.
 */
export function MenuScreen({ cls, kicker, title, hint, card, children }: MenuScreenProps) {
  return (
    <div class={`menu-screen ${cls}`} role="dialog" aria-label={title}>
      <div class="menu-screen-main">
        <header class="menu-screen-head">
          <span class="menu-screen-kicker">{kicker}</span>
          <h1 class="menu-screen-title">{title}</h1>
        </header>
        {children}
        <span class="menu-hint">{hint}</span>
      </div>
      {card}
    </div>
  );
}
