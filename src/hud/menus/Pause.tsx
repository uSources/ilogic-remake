import { t } from '../../settings';
import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** Una opcion con su posicion en el menu entero (la que entienden menuHover y menuPick). */
interface IndexedItem {
  item: MenuItemVM;
  index: number;
}

function PauseItem({ item, index, isSelected }: IndexedItem & { isSelected: boolean }) {
  return (
    <Button
      class={`pause-item ${isSelected ? 'sel' : ''} ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
      aria-disabled={item.disabled}
      onMouseEnter={() => ui.actions.menuHover(index)}
      onClick={() => ui.actions.menuPick(index)}
    >
      <span>{item.label}</span>
      {item.hint && <span class="key">{item.hint}</span>}
    </Button>
  );
}

/** Pausa (menu de la partida): las opciones normales en rejilla y las peligrosas aparte, abajo. */
export function Pause({ menu }: { menu: MenuVM }) {
  const all: IndexedItem[] = menu.items.map((item, index) => ({ item, index }));
  const renderItem = ({ item, index }: IndexedItem) => (
    <PauseItem key={index} item={item} index={index} isSelected={index === menu.selected} />
  );
  return (
    <Veil kind="veil" onClose={() => ui.actions.menuClose()}>
      <div class="px pause" role="dialog" aria-label={t('pause')}>
        <span class="htitle">{menu.title}</span>
        {menu.subtitle && <span class="muted small">{menu.subtitle}</span>}
        {menu.info?.map((line) => (
          <span class="pause-info">{line}</span>
        ))}
        <div class="pause-grid">{all.filter(({ item }) => !item.danger).map(renderItem)}</div>
        <div class="pause-danger">{all.filter(({ item }) => item.danger).map(renderItem)}</div>
      </div>
    </Veil>
  );
}
