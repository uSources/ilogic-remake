import type { ComponentChildren } from 'preact';
import { imgUrl } from '../../assets';
import { t } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import type { HomeEntryVM } from '../vm/menus';
import { MenuTabs } from './MenuTabs';
import { TextEntry } from './TextEntry';

/** Corazon pixel (7×6), en rojo. */
function Heart() {
  return (
    <svg class="heart" viewBox="0 0 7 6" width="21" height="18" role="img" aria-label="♥" shape-rendering="crispEdges">
      <path fill="#ff4d45" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
      <path fill="#ff9a94" d="M1 1h1v1H1z" />
    </svg>
  );
}

/** Lo que se le pasa a cada pieza de Inicio: que esta elegido y que hacer al pasar o pulsar. */
interface Focus {
  focused: string;
  hover: (id: string) => () => void;
  pick: (id: string) => () => void;
}

/** Un enlace de las pestañas de arriba o del pie: elegido con el teclado o al pasar el raton. */
function HomeLink({ id, focus, cls, children }: { id: string; focus: Focus; cls: string; children: ComponentChildren }) {
  return (
    <Btn sel={focus.focused === id} cls={cls} onHover={focus.hover(id)} onPick={focus.pick(id)}>
      {children}
    </Btn>
  );
}

/** Una entrada de la lista. Si pide jugar (te toca en linea), lo de debajo va en una chapa amarilla aunque no este elegida. */
function Entry({ entry, focus }: { entry: HomeEntryVM; focus: Focus }) {
  return (
    <TextEntry
      sel={focus.focused === entry.id}
      cls={`entry-${entry.id} ${entry.urgent ? 'urgent' : ''}`}
      title={entry.title}
      note={entry.note}
      onHover={focus.hover(entry.id)}
      onPick={focus.pick(entry.id)}
    />
  );
}

function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div class="px credits-box" role="dialog" onClick={onClose}>
      <span class="label">{t('credits')}</span>
      <p class="cr-main">
        {t('creditsMade')} <Heart /> {t('creditsBy')}
      </p>
      <p>{t('creditsRemake')}</p>
      <p class="cr-place">{t('creditsPlace')}</p>
    </div>
  );
}

/** Inicio, el menu clasico de texto: el logo, la lista de lo que se juega, las pestañas de arriba y el pie. */
export function Home({ s }: { s: UIState }) {
  const home = s.home;
  const focus: Focus = {
    focused: home.focus,
    hover: (id) => () => ui.actions.homeHover(id),
    pick: (id) => () => ui.actions.homePick(id),
  };
  return (
    <div class="home">
      <MenuTabs current="play" focused={home.focus} onHover={(id) => ui.actions.homeHover(id)} onPick={(id) => ui.actions.homePick(id)} />
      <div class="home-main">
        <img class="px-icon logo" src={imgUrl('logoilogic')} alt="Ilogic" />
        <nav class="text-list" aria-label={t('mainMenu')}>
          {home.entries.map((entry) => (
            <Entry key={entry.id} entry={entry} focus={focus} />
          ))}
        </nav>
        <span class="menu-hint">{t('homeHint')}</span>
      </div>
      <div class="home-foot">
        <HomeLink id="credits" focus={focus} cls="link">
          {t('credits')}
        </HomeLink>
        <HomeLink id="web" focus={focus} cls="link">
          {t('website')}
        </HomeLink>
      </div>
      {home.credits && <Credits onClose={focus.pick('credits')} />}
    </div>
  );
}
