import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { Popover } from '../common/Popover';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** Una unidad que se puede comprar: su retrato y su precio; apagada si no llega el dinero. */
function BuyTile({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  return (
    <Button
      role="menuitem"
      class={`buy-tile ${isSelected ? 'sel' : ''} ${item.disabled ? 'off' : ''}`}
      title={item.label}
      aria-label={`${item.label} · ${item.hint ?? ''}`}
      aria-disabled={item.disabled}
      onMouseEnter={() => ui.actions.menuHover(index)}
      onClick={() => ui.actions.menuPick(index)}
    >
      <Icon k={item.icon} alt="" cls="px-icon buy-portrait" />
      <span class="buy-price num">{item.hint}</span>
    </Button>
  );
}

/**
 * La compra en una fabrica propia (docs/PLAN-INTERFAZ.md, fase 4): una rejilla de retratos con su
 * precio junto al edificio, sin fila de «Cancelar» (tocar fuera o Esc la cierra) y un toque compra.
 * Debajo, el nombre y los datos de la señalada (y por que no se puede, si no se puede).
 */
export function BuyGrid({ menu }: { menu: MenuVM }) {
  const selected = menu.items[menu.selected];
  return (
    <Popover anchor={menu.anchor} prefer="right" class="pop buy-grid" label={menu.title}>
      <div class="buy-head">
        <span class="buy-title">{menu.title}</span>
        {menu.subtitle && <span class="buy-funds num">{menu.subtitle}</span>}
      </div>
      <div class="buy-tiles" role="menu">
        {menu.items.map((item, index) => (
          <BuyTile key={item.id} item={item} index={index} isSelected={index === menu.selected} />
        ))}
      </div>
      {selected && (
        <div class="buy-detail">
          <b>{selected.label}</b>
          {selected.detail && <span> · {selected.detail}</span>}
        </div>
      )}
    </Popover>
  );
}
