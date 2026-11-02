import { Fragment } from 'preact';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { Popover } from '../common/Popover';
import { ui } from '../store';
import type { MenuVM } from '../vm/menus';

/** Menu emergente junto a la casilla: ordenes de una unidad, compra y carga (la pausa va aparte). */
export function PopMenu({ m }: { m: MenuVM }) {
  const a = ui.actions;
  const sel = m.items[m.selected];
  const withIcons = m.items.some((i) => i.icon);
  return (
    <Popover anchor={m.anchor} prefer="right" class={`pop pop-${m.kind}`} label={m.title}>
      {m.title && <div class="label title">{m.title}</div>}
      {m.subtitle && <div class="sub">{m.subtitle}</div>}
      <div class="scroll" role="menu">
        {m.items.map((it, i) => (
          <Fragment key={i}>
            {it.danger && i > 0 && <div class="sep" />}
            <Button
              role="menuitem"
              class={`item ${withIcons ? 'icon' : ''} ${i === m.selected ? 'sel' : ''} ${it.disabled ? 'disabled' : ''} ${it.danger ? 'danger' : ''}`}
              aria-disabled={it.disabled}
              onMouseEnter={() => a.menuHover(i)}
              onClick={() => a.menuPick(i)}
              scrollTo={i === m.selected}
            >
              {it.icon !== undefined && <Icon k={it.icon} />}
              <span>{it.label}</span>
              {it.hint && <span class="hint">{it.hint}</span>}
            </Button>
          </Fragment>
        ))}
      </div>
      {sel?.detail && <div class="detail">{sel.detail}</div>}
    </Popover>
  );
}
