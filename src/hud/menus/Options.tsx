import { t } from '../../settings';
import { Btn, Button, scrollRef } from '../common/buttons';
import { Seg } from '../common/Seg';
import { Veil } from '../common/Veil';
import type { UIState } from '../state';
import { ui } from '../store';
import type { ActionRowVM, KeyRowVM, OptionsRowVM } from '../vm/menus';

type OptionsVM = NonNullable<UIState['options']>;

/** Una fila con su posicion en la lista entera (la que entienden optionsHover, optionsSet y optionsPick). */
interface IndexedRow {
  row: OptionsRowVM;
  index: number;
}

/** Las filas juntas por su `group`, en el orden en que aparece cada grupo por primera vez. */
function groupRows(rows: OptionsRowVM[]): { title: string; rows: IndexedRow[] }[] {
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

/** Una tecla que se puede cambiar: la de ahora y «Cambiar» (o «Pulsa una tecla…» mientras se espera). */
function KeyRow({ row, sel, onHover, onPick }: { row: KeyRowVM; sel: boolean; onHover: () => void; onPick: () => void }) {
  return (
    <div class={`seg-row key-row ${sel ? 'sel' : ''} ${row.capturing ? 'capturing' : ''}`} onMouseEnter={onHover} ref={scrollRef(sel)}>
      <span class="seg-label">{row.label}</span>
      <span class="key-value">
        {row.capturing ? <span class="key-wait">{t('keyPress')}</span> : <span class="key">{row.value}</span>}
        <Button class="px-btn plain small" onClick={onPick} aria-label={`${t('keyChange')}: ${row.label}`}>
          {t('keyChange')}
        </Button>
      </span>
      {row.notice && <span class="key-notice">{row.notice}</span>}
    </div>
  );
}

/** Un boton suelto (volver a las teclas de serie). */
function ActionRow({ row, sel, onHover, onPick }: { row: ActionRowVM; sel: boolean; onHover: () => void; onPick: () => void }) {
  return (
    <div class={`seg-row ${sel ? 'sel' : ''}`} onMouseEnter={onHover} ref={scrollRef(sel)}>
      <span class="seg-label">{row.label}</span>
      <Button class="px-btn plain small" onClick={onPick}>
        {row.text}
      </Button>
    </div>
  );
}

/** Cada clase de fila con su componente. */
function OptionsRow({ row, index, focus }: IndexedRow & { focus: number }) {
  const actions = ui.actions;
  const common = { sel: index === focus, onHover: () => actions.optionsHover(index) };
  switch (row.kind) {
    case 'choices':
      return <Seg row={row} {...common} onSet={(choice) => actions.optionsSet(index, choice)} />;
    case 'key':
      return <KeyRow row={row} {...common} onPick={() => actions.optionsPick(index)} />;
    case 'action':
      return <ActionRow row={row} {...common} onPick={() => actions.optionsPick(index)} />;
    default:
      return row satisfies never;
  }
}

/** Un grupo sin botones de segmento (las teclas) ocupa todo el ancho, con sus filas en columnas. */
const isKeysGroup = (rows: IndexedRow[]) => rows.every(({ row }) => row.kind !== 'choices');

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
            <div class={`opt-card ${isKeysGroup(group.rows) ? 'keys' : ''}`} key={group.title}>
              <span class="label">{group.title}</span>
              {group.rows.map(({ row, index }) => (
                <OptionsRow key={row.id} row={row} index={index} focus={options.focus} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Veil>
  );
}
