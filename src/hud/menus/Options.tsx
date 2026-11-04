import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { Seg } from '../common/Seg';
import { Veil } from '../common/Veil';
import type { UIState } from '../state';
import { ui } from '../store';
import type { OptionRowVM } from '../vm/menus';

type OptionsVM = NonNullable<UIState['options']>;

/** Una fila con su posicion en la lista entera (la que entienden optionsHover y optionsSet). */
interface IndexedRow {
  row: OptionRowVM;
  index: number;
}

/** Las filas juntas por su `group`, en el orden en que aparece cada grupo por primera vez. */
function groupRows(rows: OptionRowVM[]): { title: string; rows: IndexedRow[] }[] {
  const groups: { title: string; rows: IndexedRow[] }[] = [];
  rows.forEach((row, index) => {
    let group = groups.find((candidate) => candidate.title === row.group);
    if (!group) {
      group = { title: row.group, rows: [] };
      groups.push(group);
    }
    group.rows.push({ row, index });
  });
  return groups;
}

/** Opciones (desde el menu y desde la partida): las filas, agrupadas por su `group`. */
export function Options({ options }: { options: OptionsVM }) {
  const actions = ui.actions;
  return (
    <Veil kind="veil" onClose={() => actions.optionsClose()}>
      <div class="px options" role="dialog" aria-label={t('options')}>
        <div class="help-head">
          <span class="htitle">{t('options')}</span>
          <Btn cls="px-btn plain" onPick={() => actions.optionsClose()}>
            {t('close')} <span class="key">Esc</span>
          </Btn>
        </div>
        <div class="opt-groups">
          {groupRows(options.rows).map((group) => (
            <div class="opt-card" key={group.title}>
              <span class="label">{group.title}</span>
              {group.rows.map(({ row, index }) => (
                <Seg
                  key={row.id}
                  row={row}
                  sel={index === options.focus}
                  onHover={() => actions.optionsHover(index)}
                  onSet={(choice) => actions.optionsSet(index, choice)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Veil>
  );
}
