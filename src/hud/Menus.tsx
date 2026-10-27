import { imgUrl } from '../assets';
import { settings, t } from '../settings';
import { ui, type MenuVM, type OptionRowVM, type UIState } from './store';

const noFocus = (e: MouseEvent) => e.preventDefault();
const fmt = (n: number) => n.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US');

/** Boton sin foco del navegador (el foco lo lleva la escena, con el teclado). */
function Btn(props: {
  id?: string;
  sel?: boolean;
  cls?: string;
  disabled?: boolean;
  onHover?: () => void;
  onPick: () => void;
  children: preact.ComponentChildren;
  label?: string;
}) {
  return (
    <button
      tabIndex={-1}
      type="button"
      class={`${props.cls ?? 'px-btn'} ${props.sel ? 'sel' : ''}`}
      disabled={props.disabled}
      aria-label={props.label}
      onMouseDown={noFocus}
      onMouseEnter={props.onHover}
      onClick={props.onPick}
      ref={(el) => {
        if (el && props.sel) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }}
    >
      {props.children}
    </button>
  );
}

/** Botones de segmento: `20 | 32 | 40`. */
export function Seg({ row, sel, onHover, onSet }: { row: OptionRowVM; sel: boolean; onHover: () => void; onSet: (i: number) => void }) {
  return (
    <div class={`seg-row ${sel ? 'sel' : ''}`} onMouseEnter={onHover}>
      <span class="seg-label">{row.label}</span>
      <span class="seg" role="radiogroup" aria-label={row.label}>
        {row.choices.map((c, i) => (
          <button tabIndex={-1} type="button" role="radio" aria-checked={i === row.index} class={i === row.index ? 'on' : ''} onMouseDown={noFocus} onClick={() => onSet(i)}>
            {c}
          </button>
        ))}
      </span>
    </div>
  );
}

function Marks({ marks }: { marks: UIState['home']['campaign']['marks'] }) {
  return (
    <span class="marks" aria-hidden="true">
      {marks.map((m) => (
        <i class={m} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

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
              <span class="gold num">{fmt(h.save.funds)}</span>
              <span class="muted">
                {h.save.mission ?? `${h.save.size}×${h.save.size}`}
              </span>
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
        {(['help', 'options', 'credits', 'web'] as const).map((id) => (
          <Btn sel={f === id} cls="link" onHover={hover(id)} onPick={pick(id)}>
            {t(id === 'web' ? 'website' : id)}
          </Btn>
        ))}
      </div>
      {h.credits && (
        <div class="px credits-box" role="dialog" onClick={pick('credits')}>
          <span class="label">{t('credits')}</span>
          <p>{t('creditsText')}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nueva partida
// ---------------------------------------------------------------------------

export function NewGame({ s }: { s: UIState }) {
  const g = s.setup;
  const a = ui.actions;
  const f = g.focus;
  const sel = g.presets.find((p) => p.id === g.preset);
  return (
    <div class="px newgame2" role="dialog" aria-label={t('newGame')}>
      <span class="htitle">{t('newGame')}</span>
      <div class="ng-body">
        <div class="ng-preview">
          <div class="ng-map">
            <img src={g.thumb} alt={g.mapInfo} />
          </div>
          <span class="muted small">{g.mapInfo}</span>
          <div class="ng-coderow">
            <input
              class={`ng-code ${g.codeError ? 'bad' : ''} ${f === 'code' ? 'focus' : ''}`}
              value={g.code}
              maxLength={7}
              placeholder={g.mapCode}
              spellcheck={false}
              autocomplete="off"
              aria-label={t('mapCode')}
              onFocus={() => a.setupHover('code')}
              onMouseEnter={() => a.setupHover('code')}
              onInput={(e) => a.setupCode((e.currentTarget as HTMLInputElement).value)}
            />
            <Btn sel={f === 'reroll'} cls="px-btn plain" onHover={() => a.setupHover('reroll')} onPick={() => a.setupPick('reroll')}>
              {t('otherMap')} <span class="key">R</span>
            </Btn>
          </div>
          {g.codeError && <span class="bad-note">{t('badCode')}</span>}
        </div>
        <div class="ng-side">
          <div class="presets">
            {g.presets.map((p) => (
              <Btn
                sel={f === `preset-${p.id}`}
                cls={`preset ${g.preset === p.id ? 'on' : ''}`}
                onHover={() => a.setupHover(`preset-${p.id}`)}
                onPick={() => a.setupPick(`preset-${p.id}`)}
              >
                {p.label}
              </Btn>
            ))}
          </div>
          {g.preset === 'custom' ? (
            <div class="ng-groups">
              {g.groups.map((gr) => (
                <div class="ng-group">
                  <span class="label">{gr.title}</span>
                  {gr.rows.map((r) => (
                    <Seg row={r} sel={f === r.id} onHover={() => a.setupHover(r.id)} onSet={(i) => a.setupSet(r.id, i)} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p class="ng-note">{sel?.note}</p>
          )}
        </div>
      </div>
      <div class="ng-foot">
        <Btn sel={f === 'back'} cls="px-btn plain" onHover={() => a.setupHover('back')} onPick={() => a.setupPick('back')}>
          {t('back')} <span class="key">Esc</span>
        </Btn>
        <Btn sel={f === 'start'} cls="px-btn start" onHover={() => a.setupHover('start')} onPick={() => a.setupPick('start')}>
          {t('start')}
        </Btn>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaña
// ---------------------------------------------------------------------------

export function Campaign({ s }: { s: UIState }) {
  const a = ui.actions;
  const c = s.campaign;
  const sel = c.items[c.selected];
  return (
    <div class="px campaign2" role="dialog" aria-label={t('campaign')}>
      <span class="htitle">{t('campaign')}</span>
      <div class="cp-cards" role="listbox">
        {c.items.map((it, i) => (
          <button
            tabIndex={-1}
            type="button"
            role="option"
            aria-selected={i === c.selected}
            class={`cp-card ${it.status} ${i === c.selected ? 'sel' : ''}`}
            onMouseDown={noFocus}
            onMouseEnter={() => a.campaignHover(i)}
            onClick={() => a.campaignPick(i)}
            ref={(el) => {
              if (el && i === c.selected) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }}
          >
            <span class="cp-num">{i + 1}</span>
            <img src={it.thumb} alt="" />
            <span class="cp-kind">{it.kind}</span>
            <span class="cp-title">{it.title}</span>
            <span class="cp-state">
              {it.status === 'done' ? `✓${it.best ? ` ${it.best} ${t('days')}` : ''}` : it.status === 'locked' ? t('locked') : ''}
            </span>
          </button>
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

// ---------------------------------------------------------------------------
// Opciones (menu y partida)
// ---------------------------------------------------------------------------

export function Options({ o }: { o: NonNullable<UIState['options']> }) {
  const a = ui.actions;
  const groups: { title: string; rows: { r: OptionRowVM; i: number }[] }[] = [];
  o.rows.forEach((r, i) => {
    let g = groups.find((x) => x.title === r.group);
    if (!g) groups.push((g = { title: r.group, rows: [] }));
    g.rows.push({ r, i });
  });
  return (
    <div class="veil" onClick={(e) => e.target === e.currentTarget && a.optionsClose()}>
      <div class="px options" role="dialog" aria-label={t('options')}>
        <div class="help-head">
          <span class="htitle">{t('options')}</span>
          <Btn cls="px-btn plain" onPick={() => a.optionsClose()}>
            {t('close')} <span class="key">Esc</span>
          </Btn>
        </div>
        <div class="opt-groups">
          {groups.map((g) => (
            <div class="opt-card">
              <span class="label">{g.title}</span>
              {g.rows.map(({ r, i }) => (
                <Seg row={r} sel={i === o.focus} onHover={() => a.optionsHover(i)} onSet={(k) => a.optionsSet(i, k)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pausa
// ---------------------------------------------------------------------------

export function Pause({ m }: { m: MenuVM }) {
  const a = ui.actions;
  const main = m.items.map((it, i) => ({ it, i })).filter(({ it }) => !it.danger);
  const danger = m.items.map((it, i) => ({ it, i })).filter(({ it }) => it.danger);
  const item = ({ it, i }: { it: MenuVM['items'][number]; i: number }) => (
    <button
      tabIndex={-1}
      type="button"
      class={`pause-item ${i === m.selected ? 'sel' : ''} ${it.danger ? 'danger' : ''} ${it.disabled ? 'disabled' : ''}`}
      aria-disabled={it.disabled}
      onMouseDown={noFocus}
      onMouseEnter={() => a.menuHover(i)}
      onClick={() => a.menuPick(i)}
    >
      <span>{it.label}</span>
      {it.hint && <span class="key">{it.hint}</span>}
    </button>
  );
  return (
    <div class="veil" onClick={(e) => e.target === e.currentTarget && a.menuClose()}>
      <div class="px pause" role="dialog" aria-label={t('pause')}>
        <span class="htitle">{m.title}</span>
        {m.subtitle && <span class="muted small">{m.subtitle}</span>}
        {m.info?.map((l) => <span class="pause-info">{l}</span>)}
        <div class="pause-grid">{main.map(item)}</div>
        <div class="pause-danger">{danger.map(item)}</div>
      </div>
    </div>
  );
}
