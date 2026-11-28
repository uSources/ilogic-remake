import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/**
 * Una unidad de la lista, con el aire del menu de texto (textlist.css): la flecha si es la señalada, su
 * retrato, su nombre con lo que haga falta debajo (lo que falta, por que no cabe, que te deja a 0) y su
 * precio a la derecha. La que no te llega sale apagada, pero se puede señalar para leer de que va. Por
 * eso no es un TextEntry: su apagada no se señala, y aqui van ademas el retrato y el precio aparte.
 */
function BuyEntry({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  const note = item.buy?.note;
  return (
    <Btn
      sel={isSelected}
      cls={`text-entry buy-entry ${item.disabled ? 'disabled' : ''}`}
      label={[item.label, item.hint, note].filter(Boolean).join(' · ')}
      onHover={() => ui.actions.menuHover(index)}
      onPick={() => ui.actions.menuPick(index)}
    >
      <span class="text-arrow" aria-hidden="true">
        ▸
      </span>
      <Icon k={item.icon} alt="" cls="px-icon buy-portrait" />
      <span class="text-entry-text buy-name">
        <span class="text-entry-title">{item.label}</span>
        {note && <span class="text-entry-note">{note}</span>}
      </span>
      <span class="buy-price num">{item.hint}</span>
    </Btn>
  );
}

/** Lo de la señalada, al pie: su nombre, de que va y con cuanto dinero te quedas (o lo que falta). */
function BuyAbout({ item }: { item: MenuItemVM }) {
  const facts = item.buy;
  if (!facts) return null;
  return (
    <div class="buy-about" role="status">
      <span class="buy-about-name">{item.label}</span>
      {facts.about.map((line) => (
        <span key={line} class="buy-about-line">
          {line}
        </span>
      ))}
      <span class={`buy-balance ${item.disabled ? 'short' : ''}`}>{facts.balance}</span>
    </div>
  );
}

/** Arriba: el nombre del edificio en grande y, a su derecha, el dinero que tienes. */
function BuyHead({ building, funds }: { building?: string; funds?: string }) {
  return (
    <header class="buy-head">
      <h2 class="buy-title">{building}</h2>
      <span class="buy-funds">
        <span>{t('buyFunds')}</span>
        <b class="num">{funds}</b>
      </span>
    </header>
  );
}

/**
 * La compra en una fabrica propia (lienzo «Todo en estilo C», tablero 10): a la derecha, sobre el
 * tablero oscurecido por ese lado, el nombre del edificio y lo que tienes; debajo, la lista de lo que
 * fabrica, y al pie, de que va la señalada y con cuanto te quedas. Flechas, Enter y Esc, como la pausa
 * (systems/turn/buyKeys.ts); tocar el tablero la cierra.
 */
export function BuyList({ menu }: { menu: MenuVM }) {
  const selected = menu.items[menu.selected];
  return (
    <>
      <div class="buy-shade" aria-hidden="true" />
      <section class="buy-list" aria-label={menu.title}>
        <BuyHead building={menu.title} funds={menu.subtitle} />
        <nav class="text-list buy-entries" aria-label={menu.title}>
          {menu.items.map((item, index) => (
            <BuyEntry key={item.id} item={item} index={index} isSelected={index === menu.selected} />
          ))}
        </nav>
        {selected && <BuyAbout item={selected} />}
        <span class="menu-hint">{t('buyHint')}</span>
      </section>
    </>
  );
}
