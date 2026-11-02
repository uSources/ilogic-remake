import { t } from '../../settings';
import { Btn, Button } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';

/** Campaña: una tarjeta por mision y, debajo, la explicacion de la elegida. */
export function Campaign({ s }: { s: UIState }) {
  const a = ui.actions;
  const c = s.campaign;
  const sel = c.items[c.selected];
  return (
    <div class="px campaign2" role="dialog" aria-label={t('campaign')}>
      <span class="htitle">{t('campaign')}</span>
      <div class="cp-cards" role="listbox">
        {c.items.map((it, i) => (
          <Button
            key={it.id}
            role="option"
            aria-selected={i === c.selected}
            class={`cp-card ${it.status} ${i === c.selected ? 'sel' : ''}`}
            onMouseEnter={() => a.campaignHover(i)}
            onClick={() => a.campaignPick(i)}
            scrollTo={i === c.selected}
          >
            <span class="cp-num">{i + 1}</span>
            <img src={it.thumb} alt="" />
            <span class="cp-kind">{it.kind}</span>
            <span class="cp-title">{it.title}</span>
            <span class="cp-state">
              {it.status === 'done' ? `✓${it.best ? ` ${it.best} ${t('days')}` : ''}` : it.status === 'locked' ? t('locked') : ''}
            </span>
          </Button>
        ))}
      </div>
      {sel && (
        <div class="cp-brief2">
          <div class="cp-text">
            <span class="label">
              {c.selected + 1}. {sel.title}
            </span>
            <p>{c.brief}</p>
            <p class="cp-obj">{c.objective}</p>
            {sel.best !== null && (
              <p class="muted">
                {t('bestDays')}: {sel.best} {t('days')}
              </p>
            )}
          </div>
          {sel.status === 'locked' ? (
            <p class="muted">{t('locked')}</p>
          ) : (
            <Btn onPick={() => a.campaignPick(c.selected)}>
              {t('play')} <span class="key">Enter</span>
            </Btn>
          )}
        </div>
      )}
      <Btn cls="px-btn plain cp-back" onPick={() => a.campaignBack()}>
        {t('back')} <span class="key">Esc</span>
      </Btn>
    </div>
  );
}
