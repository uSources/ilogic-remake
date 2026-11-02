import { t } from '../../settings';
import { Button } from '../common/buttons';
import { Veil } from '../common/Veil';
import { ui } from '../store';
import type { MenuItemVM, MenuVM } from '../vm/menus';

/** Pausa (menu de la partida): las opciones normales en rejilla y las peligrosas aparte, abajo. */
export function Pause({ m }: { m: MenuVM }) {
  const a = ui.actions;
  const all = m.items.map((it, i) => ({ it, i }));
  const main = all.filter(({ it }) => !it.danger);
  const danger = all.filter(({ it }) => it.danger);
  const item = ({ it, i }: { it: MenuItemVM; i: number }) => (
    <Button
      key={i}
      class={`pause-item ${i === m.selected ? 'sel' : ''} ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
      aria-disabled={it.disabled}
      onMouseEnter={() => a.menuHover(i)}
      onClick={() => a.menuPick(i)}
    >
      <span>{it.label}</span>
      {it.hint && <span class="key">{it.hint}</span>}
    </Button>
  );
  return (
    <Veil kind="veil" onClose={() => a.menuClose()}>
      <div class="px pause" role="dialog" aria-label={t('pause')}>
        <span class="htitle">{m.title}</span>
        {m.subtitle && <span class="muted small">{m.subtitle}</span>}
        {m.info?.map((l) => (
          <span class="pause-info">{l}</span>
        ))}
        <div class="pause-grid">{main.map(item)}</div>
        <div class="pause-danger">{danger.map(item)}</div>
      </div>
    </Veil>
  );
}
