import type { ComponentChildren } from 'preact';
import { imgUrl } from '../../assets';
import { t } from '../../settings';
import { Btn } from '../common/buttons';
import { useUI } from '../common/useUI';
import type { UIState } from '../state';
import { ui } from '../store';
import { MenuTabs, type MenuTabId } from './MenuTabs';

/** Novedades, Aprender u Opciones tapan la pantalla: lo que hay debajo (Inicio, la pausa) no se pinta. */
export const isPageOpen = (s: UIState): boolean => !!(s.notes || s.help || s.options);

interface MenuPageProps {
  tab: Exclude<MenuTabId, 'play'>;
  title: string;
  onClose: () => void;
  /** La clase de la pagina (su forma por dentro). */
  cls: string;
  children: ComponentChildren;
}

/** En Inicio: el logo y las pestañas, como en el menu (Jugar vuelve a la lista). */
function MenuHead({ tab }: { tab: MenuPageProps['tab'] }) {
  return (
    <header class="page-head">
      <img class="px-icon page-logo" src={imgUrl('logoilogic')} alt="Ilogic" />
      <MenuTabs current={tab} onPick={(id) => ui.actions.menuTab(id)} />
    </header>
  );
}

/** En la partida no hay pestañas: su titulo y «Cerrar». */
function MatchHead({ title, onClose }: Pick<MenuPageProps, 'title' | 'onClose'>) {
  return (
    <header class="page-head">
      <span class="page-title">{title}</span>
      <Btn cls="page-close" sound="ui_close" onPick={onClose}>
        {t('close')} <span class="key">Esc</span>
      </Btn>
    </header>
  );
}

/**
 * Una pagina del menu clasico (Novedades, Aprender, Opciones): ocupa la pantalla sobre la noche, con el
 * tablero 3D apenas visible detras. Abierta desde Inicio lleva sus pestañas; desde la partida, su titulo.
 */
export function MenuPage({ tab, title, onClose, cls, children }: MenuPageProps) {
  const inMenu = useUI().screen === 'menu';
  return (
    <div class={`menu-page ${cls}`} role="dialog" aria-label={title}>
      {inMenu ? <MenuHead tab={tab} /> : <MatchHead title={title} onClose={onClose} />}
      {children}
    </div>
  );
}
