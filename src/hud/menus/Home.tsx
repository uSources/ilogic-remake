import { imgUrl } from '../../assets';
import { fmtNum, t } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import type { MarkVM } from '../vm/menus';

/** Marcas de las misiones de la campaña (hecha, abierta, cerrada). */
function Marks({ marks }: { marks: MarkVM[] }) {
  return (
    <span class="marks" aria-hidden="true">
      {marks.map((m) => (
        <i class={m} />
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

/** Inicio: partida guardada, partida nueva, campaña y los enlaces de abajo. */
export function Home({ s }: { s: UIState }) {
  const h = s.home;
  const a = ui.actions;
  const f = h.focus;
  const hover = (id: string) => () => a.homeHover(id);
  const pick = (id: string) => () => a.homePick(id);
  const cardSel = (...ids: string[]) => (ids.includes(f) ? 'sel' : '');
  return (
    <div class="home">
      <img class="px-icon logo" src={imgUrl('logoilogic')} alt="Ilogic" />
      <div class="home-cards">
        {h.save && (
          <div class={`px card card-continue ${cardSel('continue')}`} onMouseEnter={hover('continue')} onClick={pick('continue')}>
            <span class="label">{t('savedGame')}</span>
            <img class="thumb" src={h.save.thumb} alt="" />
            <div class="card-info">
              <span class="big">
                {t('day')} {h.save.day}
                {h.save.limit ? <span class="muted"> / {h.save.limit}</span> : null}
              </span>
              <span class="gold num">{fmtNum(h.save.funds)}</span>
              <span class="muted">{h.save.mission ?? `${h.save.size}×${h.save.size}`}</span>
            </div>
            <Btn sel={f === 'continue'} onPick={pick('continue')}>
              {t('continueGame')} <span class="key">Enter</span>
            </Btn>
          </div>
        )}
        <div class={`px card card-new ${cardSel('quick', 'custom')}`}>
          <span class="label">{t('newGame')}</span>
          <div class="card-art" aria-hidden="true">
            <img class="px-icon" src={imgUrl('b_Soldier')} alt="" />
            <img class="px-icon" src={imgUrl('b_Tank')} alt="" />
            <img class="px-icon" src={imgUrl('r_Artillery')} alt="" />
          </div>
          <span class="muted small">{h.quick}</span>
          <div class="card-btns">
            <Btn sel={f === 'quick'} onHover={hover('quick')} onPick={pick('quick')}>
              {t('quickGame')} ▸
            </Btn>
            <Btn sel={f === 'custom'} cls="px-btn plain" onHover={hover('custom')} onPick={pick('custom')}>
              {t('customGame')}
            </Btn>
          </div>
        </div>
        <div class={`px card card-campaign ${cardSel('campaign')}`} onMouseEnter={hover('campaign')} onClick={pick('campaign')}>
          <span class="label">{t('campaign')}</span>
          {h.campaign.thumb ? <img class="thumb" src={h.campaign.thumb} alt="" /> : <div class="thumb done">✓</div>}
          <div class="card-info">
            <span class="big">
              {h.campaign.done} {t('of')} {h.campaign.total}
            </span>
            <span class="muted">{h.campaign.next ? `${t('nextMission')}: ${h.campaign.next}` : t('allDone')}</span>
            <Marks marks={h.campaign.marks} />
          </div>
          <Btn sel={f === 'campaign'} cls="px-btn plain" onPick={pick('campaign')}>
            {t('campaign')} ▸
          </Btn>
        </div>
      </div>
      <div class="home-foot">
        <Btn sel={f === 'news'} cls="link news-link" onHover={hover('news')} onPick={pick('news')}>
          {t('news')}
          {s.updateAvailable ? (
            <span class="news-badge">v{s.updateAvailable}</span>
          ) : s.newsBadge ? (
            <span class="news-dot" aria-label={t('notesNew')} />
          ) : null}
        </Btn>
        {FOOT_LINKS.map((id) => (
          <Btn key={id} sel={f === id} cls="link" onHover={hover(id)} onPick={pick(id)}>
            {t(id === 'web' ? 'website' : id)}
          </Btn>
        ))}
      </div>
      {h.credits && (
        <div class="px credits-box" role="dialog" onClick={pick('credits')}>
          <span class="label">{t('credits')}</span>
          <p class="cr-main">
            {t('creditsMade')} <Heart /> {t('creditsBy')}
          </p>
          <p>{t('creditsRemake')}</p>
          <p class="cr-place">{t('creditsPlace')}</p>
        </div>
      )}
    </div>
  );
}
