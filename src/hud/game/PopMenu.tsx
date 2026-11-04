import { Fragment } from 'preact';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { Popover } from '../common/Popover';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

function PopMenuItem({ item, index, isSelected, withIcons }: { item: MenuItemVM; index: number; isSelected: boolean; withIcons: boolean }) {
  return (
    <Button
      role="menuitem"
      class={`item ${withIcons ? 'icon' : ''} ${isSelected ? 'sel' : ''} ${item.disabled ? 'disabled' : ''} ${item.danger ? 'danger' : ''}`}
      aria-disabled={item.disabled}
      onMouseEnter={() => ui.actions.menuHover(index)}
      onClick={() => ui.actions.menuPick(index)}
      scrollTo={isSelected}
    >
      {item.icon !== undefined && <Icon k={item.icon} />}
      <span>{item.label}</span>
      {item.hint && <span class="hint">{item.hint}</span>}
    </Button>
  );
}

/** Menu emergente junto a la casilla: ordenes de una unidad, compra y carga (la pausa va aparte). */
export function PopMenu({ menu }: { menu: MenuVM }) {
  const selected = menu.items[menu.selected];
  // Si alguna lleva icono (compra, carga), todas cambian de letra y margen para ir a juego.
  const withIcons = menu.items.some((item) => item.icon);
  return (
    <Popover anchor={menu.anchor} prefer="right" class={`pop pop-${menu.kind}`} label={menu.title}>
      {menu.title && <div class="label title">{menu.title}</div>}
      {menu.subtitle && <div class="sub">{menu.subtitle}</div>}
      <div class="scroll" role="menu">
        {menu.items.map((item, index) => (
          <Fragment key={index}>
            {/* Las peligrosas (disolver...) van separadas de las de antes por una raya. */}
            {item.danger && index > 0 && <div class="sep" />}
            <PopMenuItem item={item} index={index} isSelected={index === menu.selected} withIcons={withIcons} />
          </Fragment>
        ))}
      </div>
      {selected?.detail && <div class="detail">{selected.detail}</div>}
    </Popover>
  );
}
