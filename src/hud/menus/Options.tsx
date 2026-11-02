import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import { Veil } from '../common/Veil';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OptionRowVM } from '../vm/menus';

/** Opciones (desde el menu y desde la partida): las filas, agrupadas por su `group`. */
export function Options({ o }: { o: NonNullable<UIState['options']> }) {
  const a = ui.actions;
  const groups: { title: string; rows: { r: OptionRowVM; i: number }[] }[] = [];
  o.rows.forEach((r, i) => {
    let g = groups.find((x) => x.title === r.group);
    if (!g) groups.push((g = { title: r.group, rows: [] }));
    g.rows.push({ r, i });
  });
  return (
    <Veil kind="veil" onClose={() => a.optionsClose()}>
      <div class="px options" role="dialog" aria-label={t('options')}>
        <div class="help-head">
          <span class="htitle">{t('options')}</span>
          <Btn cls="px-btn plain" onPick={() => a.optionsClose()}>
            {t('close')} <span class="key">Esc</span>
          </Btn>
        </div>
        <div class="opt-groups">
          {groups.map((g) => (
            <div class="opt-card" key={g.title}>
              <span class="label">{g.title}</span>
              {g.rows.map(({ r, i }) => (
                <Seg key={r.id} row={r} sel={i === o.focus} onHover={() => a.optionsHover(i)} onSet={(k) => a.optionsSet(i, k)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Veil>
  );
}
