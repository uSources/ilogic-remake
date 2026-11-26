import { fmtNum, t, type TextKey } from '../../settings';
import { Veil } from '../common/Veil';
import { ui } from '../store';
import type { MenuItemVM, MenuVM, StandingVM } from '../vm/menus';
import { TextEntry } from './TextEntry';

function PauseEntry({ item, index, isSelected }: { item: MenuItemVM; index: number; isSelected: boolean }) {
  return (
    <TextEntry
      sel={isSelected}
      cls={`${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
      title={item.label}
      note={item.detail}
      keyHint={item.hint}
      onHover={() => ui.actions.menuHover(index)}
      onPick={() => ui.actions.menuPick(index)}
    />
  );
}

/** Una cifra de «Cómo va»; null es lo que no se sabe (las unidades enemigas con niebla). */
const shownNumber = (value: number | null): string => (value === null ? '?' : fmtNum(value));

function StandingRow({ label, values }: { label: TextKey; values: readonly [number, number | null] }) {
  return (
    <tr>
      <th scope="row">{t(label)}</th>
      <td>{shownNumber(values[0])}</td>
      <td>{shownNumber(values[1])}</td>
    </tr>
  );
}

/** «Cómo va»: tu alianza contra sus enemigos (unidades, edificios y lo que pagan al día). */
function Standing({ standing }: { standing: StandingVM }) {
  return (
    <section class="pause-standing" aria-label={t('standing')}>
      <span class="pause-standing-title">{t('standing')}</span>
      <table>
        <thead>
          <tr>
            <td />
            <th scope="col" class="you">
              {t('youShort')}
            </th>
            <th scope="col" class="enemy">
              {t('enemy')}
            </th>
          </tr>
        </thead>
        <tbody>
          <StandingRow label="standingUnits" values={standing.units} />
          <StandingRow label="standingBuildings" values={standing.buildings} />
          <StandingRow label="standingIncome" values={standing.income} />
        </tbody>
      </table>
    </section>
  );
}

/**
 * La pausa, como el menu clasico de Inicio: sobre el tablero desenfocado, a la izquierda lo que se
 * juega, «Pausa» en grande y sus opciones en texto; a la derecha, «Cómo va». Tocar fuera la cierra.
 */
export function Pause({ menu }: { menu: MenuVM }) {
  return (
    <Veil kind="veil" cls="pause-veil" onClose={() => ui.actions.menuClose()}>
      <div class="pause" role="dialog" aria-label={t('pause')}>
        <header class="pause-head">
          {menu.subtitle && <span class="pause-kicker">{menu.subtitle}</span>}
          <h1 class="pause-title">{menu.title}</h1>
          {menu.info?.map((line) => (
            <span class="pause-info">{line}</span>
          ))}
        </header>
        <nav class="text-list pause-list" aria-label={t('pause')}>
          {menu.items.map((item, index) => (
            <PauseEntry key={item.id} item={item} index={index} isSelected={index === menu.selected} />
          ))}
        </nav>
        <span class="menu-hint">{t('pauseHint')}</span>
      </div>
      {menu.standing && <Standing standing={menu.standing} />}
    </Veil>
  );
}
