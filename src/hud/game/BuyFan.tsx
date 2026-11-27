import { fmtNum } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { scaled, zoom } from '../common/uiScale';
import { fanAround } from '../common/placement';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** Lo que mide cada ficha del abanico (px de la interfaz; el mismo que en chips.css, `.fan-slot`). */
const SLOT = { width: 76, height: 92 };

/** Una unidad que se puede comprar: retrato, nombre y precio; apagada y con lo que falta si no llega. */
function FanSlot({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  const missing = item.buy?.missing ?? null;
  return (
    <Button
      role="menuitem"
      class={`fan-slot ${isSelected ? 'sel' : ''} ${item.disabled ? 'off' : ''}`}
      title={item.label}
      aria-label={`${item.label} · ${item.hint ?? ''}`}
      aria-disabled={item.disabled}
      onMouseEnter={() => ui.actions.menuHover(index)}
      onClick={() => ui.actions.menuPick(index)}
    >
      <Icon k={item.icon} alt="" cls="px-icon fan-portrait" />
      <span class="fan-name">{item.label}</span>
      <span class={`fan-price num ${missing !== null ? 'short' : ''}`}>{missing !== null ? `−${fmtNum(missing)}` : item.hint}</span>
    </Button>
  );
}

/** La chapa de la señalada, en el centro del abanico: mover, alcance y vision, contra que es buena y por que no (sin sitio en el ejercito). */
function FanFacts({ item }: { item: MenuItemVM }) {
  const facts = item.buy;
  if (!facts) return null;
  return (
    <div class="fan-facts" role="status">
      <b class="fan-facts-name">{item.label}</b>
      <div class="fan-facts-row">
        {facts.stats.map((stat) => (
          <span key={stat.icon} class="fan-stat" title={stat.title}>
            <Icon k={stat.icon} alt={stat.title} cls="px-icon fan-stat-icon" />
            <span class="num">{stat.text}</span>
          </span>
        ))}
      </div>
      {facts.strongAgainst.length > 0 && (
        <div class="fan-facts-row fan-strong">
          <span class="fan-strong-mark">⚔</span>
          {facts.strongAgainst.map((icon) => (
            <Icon key={icon} k={icon} alt="" cls="px-icon fan-strong-icon" />
          ))}
        </div>
      )}
      {facts.why && <div class="fan-why">{facts.why}</div>}
    </div>
  );
}

/**
 * La compra en una fabrica propia (docs/PLAN-INTERFAZ-2.md, fase 5): los retratos en abanico
 * alrededor del edificio (hacia arriba si caben; si no, hacia dentro de la pantalla; muchos, la vuelta
 * entera: `fanAround`), un toque compra, y en el centro la chapa de la señalada. Tocar fuera o Esc cierra.
 */
export function BuyFan({ menu }: { menu: MenuVM }) {
  const anchor = scaled(menu.anchor);
  const screen = { width: window.innerWidth / zoom(), height: window.innerHeight / zoom() };
  const fan = fanAround({ x: anchor.x + anchor.w / 2, y: anchor.y + anchor.h / 2 }, menu.items.length, SLOT, screen);
  const selected = menu.items[menu.selected];
  return (
    <div class="buy-fan" role="menu" aria-label={menu.title} style={{ left: fan.center.x, top: fan.center.y }}>
      {menu.items.map((item, index) => {
        const { dx, dy } = fan.slots[index]!;
        return (
          <div key={item.id} class="fan-place" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
            <FanSlot item={item} index={index} isSelected={index === menu.selected} />
          </div>
        );
      })}
      {selected && <FanFacts item={selected} />}
    </div>
  );
}
