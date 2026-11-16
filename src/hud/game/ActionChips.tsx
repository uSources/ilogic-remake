import { scaled } from '../common/Popover';
import { Chip } from '../common/toy';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** El nombre de la opcion al pasar el raton (con su detalle: en capturar, los puntos del edificio). */
export const itemLabel = (item: MenuItemVM): string => (item.hint ? `${item.label} (${item.hint})` : item.label);

/** Una opcion como ficha: su dibujo o su simbolo; las de peligro, en rojo. */
export function OptionChip({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  return (
    <Chip
      label={itemLabel(item)}
      icon={item.icon}
      text={item.icon ? undefined : item.glyph}
      tone={item.danger ? 'enemy' : 'plain'}
      cls={isSelected ? 'sel' : ''}
      disabled={item.disabled}
      onClick={() => ui.actions.menuPick(index)}
    />
  );
}

/**
 * Las fichas junto a la unidad elegida (docs/PLAN-INTERFAZ.md): solo lo que no se hace tocando el
 * tablero (capturar si ya esta encima, bajar carga, reparar), en fila encima de su casilla. La
 * señalada (Intro la usa) lleva un aro.
 */
export function ActionChips({ menu }: { menu: MenuVM }) {
  const anchor = scaled(menu.anchor);
  return (
    <div class="action-chips" role="toolbar" aria-label={menu.title} style={{ left: anchor.x + anchor.w / 2, top: anchor.y }}>
      {menu.items.map((item, index) => (
        <OptionChip key={item.id} item={item} index={index} isSelected={index === menu.selected} />
      ))}
    </div>
  );
}
