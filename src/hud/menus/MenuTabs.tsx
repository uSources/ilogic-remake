import { t, type TextKey } from '../../settings';
import { Btn } from '../common/buttons';
import { useUI } from '../common/useUI';

/** Las pestañas de arriba del menu: Jugar es Inicio; las otras, sus paginas. */
export type MenuTabId = 'play' | 'news' | 'help' | 'options';

const MENU_TABS: readonly { id: MenuTabId; text: TextKey }[] = [
  { id: 'play', text: 'play' },
  { id: 'news', text: 'news' },
  { id: 'help', text: 'learn' },
  { id: 'options', text: 'options' },
];

/** Al lado de Novedades: la version nueva que se puede bajar o un punto si hay notas sin leer. */
function NewsMark() {
  const s = useUI();
  if (s.updateAvailable) return <span class="news-badge">v{s.updateAvailable}</span>;
  return s.newsBadge ? <span class="news-dot" aria-label={t('notesNew')} /> : null;
}

interface MenuTabsProps {
  current: MenuTabId;
  /** La elegida con el teclado (en Inicio, las pestañas son la primera fila). */
  focused?: string;
  onHover?: (id: MenuTabId) => void;
  onPick: (id: MenuTabId) => void;
}

/** Jugar · Novedades · Aprender · Opciones, con la de ahora subrayada en oro. */
export function MenuTabs({ current, focused, onHover, onPick }: MenuTabsProps) {
  return (
    <nav class="home-tabs" aria-label={t('mainMenu')}>
      {MENU_TABS.map(({ id, text }) =>
        id === current ? (
          <span key={id} class="home-tab current" aria-current="page">
            {t(text)}
            {id === 'news' && <NewsMark />}
          </span>
        ) : (
          <Btn key={id} sel={focused === id} cls="home-tab" onHover={() => onHover?.(id)} onPick={() => onPick(id)}>
            {t(text)}
            {id === 'news' && <NewsMark />}
          </Btn>
        ),
      )}
    </nav>
  );
}
