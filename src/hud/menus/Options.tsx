import { t } from '../../settings';
import { Btn, Button, scrollRef } from '../common/buttons';
import { Seg } from '../common/Seg';
import { Veil } from '../common/Veil';
import { ui } from '../store';
import type { ActionRowVM, KeyRowVM, OptionsRowVM, OptionsTabVM, OptionsVM, VolumeRowVM } from '../vm/menus';

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

/** Un altavoz de pixeles (9 x 8): con ondas, o con una cruz si esta callado. */
function Speaker({ muted }: { muted: boolean }) {
  const pixels = muted ? SPEAKER_MUTED : SPEAKER_ON;
  return (
    <svg class="speaker" viewBox="0 0 9 8" aria-hidden="true" shape-rendering="crispEdges">
      {[...SPEAKER, ...pixels].map(([x, y, width, height]) => (
        <rect x={x} y={y} width={width} height={height} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Rectangulos `[x, y, ancho, alto]` del altavoz: la caja y el cono; luego las ondas o la cruz. */
const SPEAKER = [
  [0, 2, 2, 4],
  [2, 1, 1, 6],
  [3, 0, 1, 8],
] as const;
const SPEAKER_ON = [
  [5, 2, 1, 1],
  [6, 3, 1, 2],
  [5, 5, 1, 1],
  [7, 1, 1, 1],
  [8, 2, 1, 4],
  [7, 6, 1, 1],
] as const;
const SPEAKER_MUTED = [
  [5, 2, 1, 1],
  [8, 2, 1, 1],
  [6, 3, 2, 2],
  [5, 5, 1, 1],
  [8, 5, 1, 1],
] as const;

interface VolumeRowProps {
  row: VolumeRowVM;
  sel: boolean;
  onHover: () => void;
  onPick: () => void;
  onSlide: (level: number) => void;
  onSlideEnd: () => void;
}

/**
 * El volumen de un canal: el altavoz lo calla (o lo vuelve a poner), el deslizador lo sube y lo baja y al
 * soltarlo suena una muestra. El deslizador no se queda con el foco: las flechas son de la pantalla.
 */
function VolumeRow({ row, sel, onHover, onPick, onSlide, onSlideEnd }: VolumeRowProps) {
  const fill = `${(row.level / row.max) * 100}%`;
  return (
    <div class={`seg-row volume-row ${sel ? 'sel' : ''} ${row.muted ? 'silenced' : ''}`} onMouseEnter={onHover} ref={scrollRef(sel)}>
      <span class="seg-label">{row.label}</span>
      <span class="volume-control">
        <Button
          class="px-btn plain small volume-mute"
          aria-pressed={row.muted}
          aria-label={`${t('volumeMute')}: ${row.label}`}
          onClick={onPick}
        >
          <Speaker muted={row.muted} />
        </Button>
        <input
          type="range"
          class="volume-slider"
          tabIndex={-1}
          min={0}
          max={row.max}
          value={row.level}
          aria-label={row.label}
          aria-valuetext={row.text}
          style={{ '--fill': fill }}
          onInput={(event) => onSlide(event.currentTarget.valueAsNumber)}
          onChange={(event) => {
            event.currentTarget.blur();
            onSlideEnd();
          }}
        />
        <span class="volume-value">{row.text}</span>
      </span>
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
    case 'volume':
      return (
        <VolumeRow
          row={row}
          {...common}
          onPick={() => actions.optionsPick(index)}
          onSlide={(level) => actions.optionsSlide(index, level)}
          onSlideEnd={() => actions.optionsSlideEnd(index)}
        />
      );
    default:
      return row satisfies never;
  }
}

/** Un grupo sin botones de segmento (las teclas, los volumenes) ocupa todo el ancho, con sus filas en columnas. */
const isWideGroup = (rows: IndexedRow[]) => rows.every(({ row }) => row.kind !== 'choices');

/** La barra de pestañas: Q y E con el teclado, o pulsarlas. */
function TabBar({ tabs, current }: { tabs: OptionsTabVM[]; current: number }) {
  return (
    <div class="opt-tabs" role="tablist">
      {tabs.map((tab, index) => (
        <Button
          key={tab.id}
          role="tab"
          aria-selected={index === current}
          class={`opt-tab ${index === current ? 'on' : ''}`}
          data-tab={tab.id}
          onClick={() => ui.actions.optionsTab(index)}
        >
          {tab.title}
        </Button>
      ))}
      <span class="opt-tabs-keys">
        <span class="key">Q</span> <span class="key">E</span>
      </span>
    </div>
  );
}

/** Las filas de la pestaña abierta, agrupadas por su `group` (el titulo del grupo solo si hay varios). */
function TabContent({ tab, focus }: { tab: OptionsTabVM; focus: number }) {
  const groups = groupRows(tab.rows);
  return (
    <div class="opt-groups">
      {groups.map((group) => (
        <div class={`opt-card ${isWideGroup(group.rows) ? 'wide' : ''}`} key={group.title}>
          {groups.length > 1 && <span class="label">{group.title}</span>}
          {group.rows.map(({ row, index }) => (
            <OptionsRow key={row.id} row={row} index={index} focus={focus} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Opciones (desde el menu y desde la partida): una pestaña por tema. */
export function Options({ options }: { options: OptionsVM }) {
  const actions = ui.actions;
  const tab = options.tabs[options.tab];
  return (
    <Veil kind="veil" onClose={() => actions.optionsClose()}>
      <div class="px options" role="dialog" aria-label={t('options')}>
        <div class="help-head">
          <span class="htitle">{t('options')}</span>
          <Btn cls="px-btn plain" sound="ui_close" onPick={() => actions.optionsClose()}>
            {t('close')} <span class="key">Esc</span>
          </Btn>
        </div>
        <TabBar tabs={options.tabs} current={options.tab} />
        {tab && <TabContent tab={tab} focus={options.focus} />}
      </div>
    </Veil>
  );
}
