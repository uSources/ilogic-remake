import { imgUrl } from '../../assets';
import { fmtNum, t } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import type { HomeVM, MarkVM } from '../vm/menus';

/** Marcas de las misiones de la campaña (hecha, abierta, cerrada). */
function Marks({ marks }: { marks: MarkVM[] }) {
  return (
    <span class="marks" aria-hidden="true">
      {marks.map((mark) => (
        <i class={mark} />
      ))}
    </span>
  );
}

/** Corazon pixel (7×6), en rojo. */
function Heart() {
  return (
    <svg class="heart" viewBox="0 0 7 6" width="21" height="18" role="img" aria-label="♥" shape-rendering="crispEdges">
      <path fill="#ff4d45" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
      <path fill="#ff9a94" d="M1 1h1v1H1z" />
    </svg>
  );
}

/** Enlaces del pie de Inicio (ademas de Novedades, que lleva su aviso). */
const FOOT_LINKS = ['help', 'options', 'credits', 'web'] as const;

/** Lo que se le pasa a cada pieza de Inicio: que esta elegido y que hacer al pasar o pulsar. */
interface Focus {
  focused: string;
  hover: (id: string) => () => void;
  pick: (id: string) => () => void;
}

const isFocused = (focus: Focus, ...ids: string[]) => ids.includes(focus.focused);
const cardSelClass = (focus: Focus, ...ids: string[]) => (isFocused(focus, ...ids) ? 'sel' : '');

function ContinueCard({ save, focus }: { save: NonNullable<HomeVM['save']>; focus: Focus }) {
  return (
    <div
      class={`px card card-continue ${cardSelClass(focus, 'continue')}`}
      onMouseEnter={focus.hover('continue')}
      onClick={focus.pick('continue')}
    >
      <span class="label">{t('savedGame')}</span>
      <img class="thumb" src={save.thumb} alt="" />
      <div class="card-info">
        <span class="big">
          {t('day')} {save.day}
          {save.limit ? <span class="muted"> / {save.limit}</span> : null}
        </span>
        <span class="gold num">{fmtNum(save.funds)}</span>
        <span class="muted">{save.mission ?? `${save.size}×${save.size}`}</span>
      </div>
      <Btn sel={isFocused(focus, 'continue')} onPick={focus.pick('continue')}>
        {t('continueGame')} <span class="key">Enter</span>
      </Btn>
    </div>
  );
}

function NewGameCard({ quickSummary, online, focus }: { quickSummary: string; online: boolean; focus: Focus }) {
  return (
    <div class={`px card card-new ${cardSelClass(focus, 'quick', 'custom', 'online')}`}>
      <span class="label">{t('newGame')}</span>
      <div class="card-art" aria-hidden="true">
        <img class="px-icon" src={imgUrl('b_Soldier')} alt="" />
        <img class="px-icon" src={imgUrl('b_Tank')} alt="" />
        <img class="px-icon" src={imgUrl('r_Artillery')} alt="" />
      </div>
      <span class="muted small">{quickSummary}</span>
      <div class="card-btns">
        <Btn sel={isFocused(focus, 'quick')} onHover={focus.hover('quick')} onPick={focus.pick('quick')}>
          {t('quickGame')} ▸
        </Btn>
        <Btn sel={isFocused(focus, 'custom')} cls="px-btn plain" onHover={focus.hover('custom')} onPick={focus.pick('custom')}>
          {t('customGame')}
        </Btn>
        {online && (
          <Btn sel={isFocused(focus, 'online')} cls="px-btn plain" onHover={focus.hover('online')} onPick={focus.pick('online')}>
            {t('online')}
          </Btn>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign, focus }: { campaign: HomeVM['campaign']; focus: Focus }) {
  return (
    <div
      class={`px card card-campaign ${cardSelClass(focus, 'campaign')}`}
      onMouseEnter={focus.hover('campaign')}
      onClick={focus.pick('campaign')}
    >
      <span class="label">{t('campaign')}</span>
      {campaign.thumb ? <img class="thumb" src={campaign.thumb} alt="" /> : <div class="thumb done">✓</div>}
      <div class="card-info">
        <span class="big">
          {campaign.done} {t('of')} {campaign.total}
        </span>
        <span class="muted">{campaign.next ? `${t('nextMission')}: ${campaign.next}` : t('allDone')}</span>
        <Marks marks={campaign.marks} />
      </div>
      <Btn sel={isFocused(focus, 'campaign')} cls="px-btn plain" onPick={focus.pick('campaign')}>
        {t('campaign')} ▸
      </Btn>
    </div>
  );
}

/** Pie: Novedades (con la version nueva o un punto si hay notas sin leer) y los enlaces. */
function FootLinks({ s, focus }: { s: UIState; focus: Focus }) {
  return (
    <div class="home-foot">
      <Btn sel={isFocused(focus, 'news')} cls="link news-link" onHover={focus.hover('news')} onPick={focus.pick('news')}>
        {t('news')}
        {s.updateAvailable ? (
          <span class="news-badge">v{s.updateAvailable}</span>
        ) : s.newsBadge ? (
          <span class="news-dot" aria-label={t('notesNew')} />
        ) : null}
      </Btn>
      {FOOT_LINKS.map((id) => (
        <Btn key={id} sel={isFocused(focus, id)} cls="link" onHover={focus.hover(id)} onPick={focus.pick(id)}>
          {t(id === 'web' ? 'website' : id)}
        </Btn>
      ))}
    </div>
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

/** Inicio: partida guardada, partida nueva, campaña y los enlaces de abajo. */
export function Home({ s }: { s: UIState }) {
  const home = s.home;
  const focus: Focus = {
    focused: home.focus,
    hover: (id) => () => ui.actions.homeHover(id),
    pick: (id) => () => ui.actions.homePick(id),
  };
  return (
    <div class="home">
      <img class="px-icon logo" src={imgUrl('logoilogic')} alt="Ilogic" />
      <div class="home-cards">
        {home.save && <ContinueCard save={home.save} focus={focus} />}
        <NewGameCard quickSummary={home.quick} online={home.online} focus={focus} />
        <CampaignCard campaign={home.campaign} focus={focus} />
      </div>
      <FootLinks s={s} focus={focus} />
      {home.credits && <Credits onClose={focus.pick('credits')} />}
    </div>
  );
}
