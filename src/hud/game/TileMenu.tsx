import { Callout } from '../common/Callout';
import { TextEntry } from '../menus/TextEntry';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** Una opcion en texto: su dibujo (si tiene), su nombre y debajo lo que diga (en capturar, los puntos). */
function TileMenuEntry({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  return (
    <TextEntry
      sel={isSelected}
      cls={`${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
      icon={item.icon}
      title={item.label}
      note={item.hint}
      onHover={() => ui.actions.menuHover(index)}
      onPick={() => ui.actions.menuPick(index)}
    />
  );
}

/**
 * Lo que sale de la casilla de lo elegido (lienzo «Lo que sale de las casillas», A): las fichas de la
 * unidad, su rueda (clic derecho) y elegir una casilla, en el bocadillo con tallo y en texto, como
 * la pausa. Encima, de quien es (la unidad o el grupo); la señalada, en grande con la flecha (Intro
 * la elige). Tocar fuera o Esc lo cierra.
 */
export function TileMenu({ menu }: { menu: MenuVM }) {
  const selected = menu.items[menu.selected];
  return (
    <Callout anchor={menu.anchor} class={`tile-menu tile-menu-${menu.kind}`} label={menu.title} role="menu">
      {menu.title && <span class="callout-title">{menu.title}</span>}
      {menu.subtitle && <span class="callout-sub">{menu.subtitle}</span>}
      <div class="text-list callout-list">
        {menu.items.map((item, index) => (
          <TileMenuEntry key={item.id} item={item} index={index} isSelected={index === menu.selected} />
        ))}
      </div>
      {selected?.detail && <span class="callout-sub">{selected.detail}</span>}
    </Callout>
  );
}
