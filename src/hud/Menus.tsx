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

/** Corazon pixel (7×6), en rojo. */
function Heart() {
  return (
    <svg class="heart" viewBox="0 0 7 6" width="21" height="18" role="img" aria-label="♥" shape-rendering="crispEdges">
      <path fill="#ff4d45" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
      <path fill="#ff9a94" d="M1 1h1v1H1z" />
    </svg>
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
        <Btn sel={f === 'news'} cls="link news-link" onHover={hover('news')} onPick={pick('news')}>
          {t('news')}
          {s.updateAvailable ? <span class="news-badge">v{s.updateAvailable}</span> : s.newsBadge ? <span class="news-dot" aria-label={t('notesNew')} /> : null}
        </Btn>
        {(['help', 'options', 'credits', 'web'] as const).map((id) => (
          <Btn sel={f === id} cls="link" onHover={hover(id)} onPick={pick(id)}>
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

// ---------------------------------------------------------------------------
// Final de la partida
// ---------------------------------------------------------------------------

/** Grafica pixel del valor de los ejercitos dia a dia. */
function ArmyChart({ data }: { data: [number, number][] }) {
  const W = 300,
    H = 90,
    pad = 4;
  const max = Math.max(1, ...data.flat());
  const n = data.length;
  const x = (i: number) => Math.round(pad + (i / Math.max(1, n - 1)) * (W - 2 * pad));
  const y = (v: number) => Math.round(H - pad - (v / max) * (H - 2 * pad));
  // Escalones (estilo pixel): horizontal y luego vertical.
  const line = (k: 0 | 1) => data.map((d, i) => (i === 0 ? `M${x(0)},${y(d[k])}` : `H${x(i)}V${y(d[k])}`)).join('');
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t('endChart')} shape-rendering="crispEdges">
      {[0.25, 0.5, 0.75].map((f) => (
        <line x1={0} x2={W} y1={Math.round(H * f)} y2={Math.round(H * f)} class="grid" />
      ))}
      <path d={line(1)} class="enemy" />
      <path d={line(0)} class="you" />
    </svg>
  );
}

const REASON = { hq: 'endHq', wipeout: 'endWipeout', days: 'endDays', objective: 'endObjective', surrender: 'endSurrender' } as const;

export function EndScreen({ e }: { e: NonNullable<UIState['end']> }) {
  const a = ui.actions;
  const title = e.mission ? (e.won ? t('missionWon') : t('missionLost')) : e.won ? t('victory') : t('defeat');
  return (
    <div class={`endscreen ${e.won ? 'won' : 'lost'}`}>
      <div class="end-head">
        {e.mission && <span class="label">{e.mission}</span>}
        <span class="end-title">{title}</span>
        {e.reason && <span class="end-reason">{t(REASON[e.reason])}</span>}
      </div>
      <div class="px end-card">
        <div class="end-cols">
          {e.chart && (
            <div class="end-chart">
              <span class="label">{t('endChart')}</span>
              <ArmyChart data={e.chart} />
              <span class="legend">
                <i class="you" /> {t('you')} <i class="enemy" /> {t('enemy')}
              </span>
            </div>
          )}
          {e.stats && (
            <table class="endstats">
              <thead>
                <tr>
                  <th />
                  <th class="you">{t('you')}</th>
                  <th class="enemy">{t('enemy')}</th>
                </tr>
              </thead>
              <tbody>
                {e.score && (
                  <tr>
                    <td>{t('points')}</td>
                    <td class="num">{fmt(e.score[0])}</td>
                    <td class="num">{fmt(e.score[1])}</td>
                  </tr>
                )}
                {(
                  [
                    ['statBuilt', e.stats.built],
                    ['statLost', e.stats.lost],
                    ['statCaptured', e.stats.captured],
                    ['statSpent', e.stats.spent],
                  ] as const
                ).map(([k, v]) => (
                  <tr>
                    <td>{t(k)}</td>
                    <td class="num">{fmt(v[0])}</td>
                    <td class="num">{fmt(v[1])}</td>
                  </tr>
                ))}
                <tr>
                  <td>{t('statDays')}</td>
                  <td class="num" colSpan={2}>
                    {e.day}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {e.best !== null && (
          <div class={`end-best ${e.newBest ? 'new' : ''}`}>
            {e.newBest ? t('newBest') : t('bestDays')}: {e.best} {t('days')}
          </div>
        )}
        <div class="end-btns">
          {e.buttons.map((b, i) => (
            <Btn sel={i === e.selected} cls={`px-btn ${i === 0 ? '' : 'plain'}`} onHover={() => a.endHover(i)} onPick={() => a.endPick(i)}>
              {b.label}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}
