import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'preact/compat';
import { imgUrl } from '../assets';
import { PatchNotes } from './PatchNotes';
import { settings, t, fmtNum } from '../settings';
import { helpText } from './helpText';
import { Campaign, EndScreen, Home, NewGame, Options, Pause } from './Menus';
import {
  ui,
  type MinimapVM,
  type MoveTipVM,
  type Anchor,
  type CombatSideVM,
  type CombatVM,
  type BreakdownLineVM,
  type DayInfoVM,
  type EconomyVM,
  type GeneralVM,
  type ForecastVM,
  type IdleVM,
  type MenuVM,
  type TileVM,
  type UIState,
  type UnitVM,
  type WeatherVM,
} from './store';
import { WeatherIcon } from './WeatherIcon';

function useUI(): UIState {
  return useSyncExternalStore(
    (l) => ui.subscribe(l),
    () => ui.get(),
  );
}

/** Evitar que los botones se queden con el foco (Enter los pulsaria ademas de la accion del juego). */
const noFocus = (e: MouseEvent) => e.preventDefault();

function Icon({ k, alt = '', cls = 'px-icon' }: { k: string | null | undefined; alt?: string; cls?: string }) {
  const src = imgUrl(k);
  return src ? <img class={cls} src={src} alt={alt} draggable={false} /> : <span class={cls} />;
}

// ---------------------------------------------------------------------------
// Colocacion de bocadillos junto a una casilla
// ---------------------------------------------------------------------------

const MARGIN = 16;
const TOP_SAFE = 80;

/** Con la interfaz ampliada (zoom en #hud), las coordenadas de pantalla se dividen por la escala. */
const zoom = () => settings.uiScale || 1;
function scaled(a: Anchor): Anchor {
  const z = zoom();
  return { x: a.x / z, y: a.y / z, w: a.w / z, h: a.h / z };
}

function Popover(props: { anchor: Anchor; prefer: 'right' | 'left'; class: string; children: ComponentChildren; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { prefer } = props;
  const anchor = scaled(props.anchor);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const vw = window.innerWidth / zoom(),
      vh = window.innerHeight / zoom();
    const gap = 10;
    const rightX = anchor.x + anchor.w + gap;
    const leftX = anchor.x - gap - w;
    const fitsRight = rightX + w <= vw - MARGIN;
    const fitsLeft = leftX >= MARGIN;
    let left: number;
    if (prefer === 'right') left = fitsRight || !fitsLeft ? rightX : leftX;
    else left = fitsLeft || !fitsRight ? leftX : rightX;
    let top = anchor.y + anchor.h / 2 - h / 2;
    // Si no cabe a ningun lado (pantalla estrecha), debajo o encima de la casilla.
    if (!fitsRight && !fitsLeft) {
      left = anchor.x + anchor.w / 2 - w / 2;
      top = anchor.y + anchor.h + gap + h <= vh - MARGIN ? anchor.y + anchor.h + gap : anchor.y - gap - h;
    }
    left = Math.max(MARGIN, Math.min(vw - MARGIN - w, left));
    top = Math.max(Math.min(TOP_SAFE, vh - h - MARGIN), Math.min(vh - MARGIN - h, top));
    const next = { left: Math.round(left), top: Math.round(top) };
    if (!pos || pos.left !== next.left || pos.top !== next.top) setPos(next);
  });
  return (
    <div
      ref={ref}
      class={`px ${props.class}`}
      role="dialog"
      aria-label={props.label}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}
    >
      {props.children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

/** Filas "3 × Ciudad  +3.000". `sign`: '+' ingresos, '−' gastos, '' puntos. */
function BreakdownRows({ lines, sign, empty }: { lines: BreakdownLineVM[]; sign: '+' | '−' | ''; empty: string }) {
  if (!lines.length) return <div class="row muted">{empty}</div>;
  return (
    <>
      {lines.map((l) => (
        <div class="row" key={l.label}>
          <span class="n num">{l.count} ×</span>
          <span class="l">{l.label}</span>
          <span class={`v num ${sign === '+' ? 'pos' : sign === '−' ? 'neg' : ''}`}>
            {sign}
            {fmtNum(l.amount)}
          </span>
        </div>
      ))}
    </>
  );
}

const signed = (n: number) => `${n < 0 ? '−' : '+'}${fmtNum(Math.abs(n))}`;

/** Desglose del dinero (al pasar por encima o tocar el dinero de arriba). */
function EconomyPanel({ e }: { e: EconomyVM }) {
  return (
    <div class="px breakdown" role="tooltip">
      <h4>{t('ecoIncome')}</h4>
      <BreakdownRows lines={e.income.lines} sign="+" empty={t('ecoNoBuildings')} />
      {e.income.scale !== 1 && (
        <div class="note">
          {t('ecoScale')}: ×{e.income.scale}
        </div>
      )}
      <div class="row total">
        <span class="l" />
        <span class="v num pos">+{fmtNum(e.income.total)}</span>
      </div>
      {e.upkeep && (
        <>
          <h4>{t('ecoUpkeep')}</h4>
          <BreakdownRows lines={e.upkeep.lines} sign="−" empty={t('ecoNoUnits')} />
          <div class="row total">
            <span class="l note">
              {Math.round(e.upkeep.rate * 100)} % {t('ecoUpkeepNote')}
            </span>
            <span class="v num neg">−{fmtNum(e.upkeep.total)}</span>
          </div>
        </>
      )}
      <div class="row net">
        <span class="l">{t('ecoNet')}</span>
        <span class={`v num ${e.net < 0 ? 'neg' : 'pos'}`}>{signed(e.net)}</span>
      </div>
      <div class="row">
        <span class="l">{t('ecoNext')}</span>
        <span class="v num gold">{fmtNum(e.next)}</span>
      </div>
      {e.shortfall !== null && (
        <div class="note warn">
          {t('ecoShortfall')} {fmtNum(e.shortfall)}
        </div>
      )}
      {e.command && (
        <>
          <h4>{t('ecoCommand')}</h4>
          <BreakdownRows lines={e.command.lines} sign="" empty={t('ecoNoUnits')} />
          <div class="row total">
            <span class="l note">
              {Math.max(0, e.command.max - e.command.used)} {t('ecoFree')}
            </span>
            <span class="v num">
              {e.command.used}/{e.command.max}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

/** Desglose del dia: limite, lo que queda y los puntos si se acabase ahora. */
function DayPanel({ d }: { d: DayInfoVM }) {
  return (
    <div class="px breakdown" role="tooltip">
      <h4>
        {t('day')} {d.day}
        {d.limit !== null && ` ${t('dayOf')} ${d.limit}`}
      </h4>
      <div class="row">
        <span class="l">{d.left === null ? t('dayNoLimit') : d.left <= 1 ? t('dayLeft1') : `${t('dayLeft')} ${d.left} ${t('days')}`}</span>
      </div>
      {d.score && (
        <>
          <h4>{t('dayScore')}</h4>
          <div class="row">
            <span class="l">{t('youShort')}</span>
            <span class="v num pos">{fmtNum(d.score[0])}</span>
          </div>
          <div class="row">
            <span class="l">{t('enemy')}</span>
            <span class="v num neg">{fmtNum(d.score[1])}</span>
          </div>
          <div class="note">{t('dayScoreNote')}</div>
        </>
      )}
    </div>
  );
}

/** Desglose: se abre al pasar el raton (CSS) o al tocarlo, y se cierra al tocarlo otra vez. */
function useTipToggle(): [boolean, () => void, (e: PointerEvent) => void] {
  const [open, setOpen] = useState(false);
  // Salir con el raton lo cierra; con el dedo no (el navegador "sale" al levantarlo, justo tras abrirlo).
  const leave = (e: PointerEvent) => e.pointerType === 'mouse' && setOpen(false);
  return [open, () => setOpen((o) => !o), leave];
}

/** Panel del general: barra de carga en estrellas y un boton por habilidad. */
function GeneralPanel({ g, mine }: { g: GeneralVM; mine: boolean }) {
  const a = ui.actions;
  return (
    <div class="px general-panel" aria-label={`${t('general')}: ${g.name}`}>
      <div class="gp-head">
        <span class="gp-face" aria-hidden="true">
          {g.name[0]}
        </span>
        <div>
          <div class="gp-name">{g.name}</div>
          <div class="gp-title">{g.title}</div>
        </div>
      </div>
      <div class="gp-charge" title={t('genChargeHint')}>
        {Array.from({ length: g.max }, (_, i) => (
          <i
            class={i < g.stars ? 'full' : i === g.stars ? 'part' : ''}
            style={i === g.stars ? { '--fill': `${Math.round(g.fraction * 100)}%` } : undefined}
          />
        ))}
      </div>
      <div class="gp-abilities">
        {g.abilities.map((ab) =>
          g.targeting === ab.id ? (
            <button tabIndex={-1} type="button" class="px-btn plain gp-ab on" onMouseDown={noFocus} onClick={() => a.cancelAbility()}>
              {t('genCancel')} <span class="key">Esc</span>
            </button>
          ) : (
            <button
              tabIndex={-1}
              type="button"
              class={`px-btn gp-ab ${ab.ready && mine ? '' : 'off'}`}
              disabled={!mine}
              title={`${ab.description}${ab.reason ? ` · ${ab.reason}` : ''}`}
              onMouseDown={noFocus}
              onClick={() => a.useAbility(ab.id)}
            >
              <span class="gp-ab-name">{ab.name}</span>
              <span class="gp-cost">{'★'.repeat(ab.cost)}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function TopBar({ s }: { s: UIState }) {
  const a = ui.actions;
  const mine = s.turn === 'player';
  const [fundsOpen, toggleFunds, closeFunds] = useTipToggle();
  const [dayOpen, toggleDay, closeDay] = useTipToggle();
  return (
    <div class="top">
      <div class={`px funds has-tip ${fundsOpen ? 'open' : ''}`} onClick={toggleFunds} onPointerLeave={closeFunds}>
        <Icon k="ui/dinero" alt="" cls="px-icon coin" />
        <div>
          <div class="amount num">{fmtNum(s.funds)}</div>
          <div class="sub">
            {s.income < 0 ? '−' : '+'}
            {fmtNum(Math.abs(s.income))} {t('perDay')} · {s.buildings} {t('buildingsN')}
            {s.command ? (
              <span class="cmd" title={t('commandShort')}>
                {' · '}
                <Icon k="ui/mando" alt={t('commandShort')} cls="px-icon ico-sm" />
                {s.command.used}/{s.command.max}
              </span>
            ) : null}
          </div>
        </div>
        {s.economy && <EconomyPanel e={s.economy} />}
      </div>
      <div class={`day has-tip ${dayOpen ? 'open' : ''}`} onClick={toggleDay} onPointerLeave={closeDay}>
        <span class="d">
          {t('day')} {s.day}
          {s.dayLimit ? <span class="dl">/{s.dayLimit}</span> : null}
        </span>
        <span class={`t ${mine ? '' : 'enemy'}`}>{mine ? t('yourTurn') : t('enemyTurn')}</span>
        {s.weather && <WeatherChip w={s.weather} />}
        {s.dayInfo && <DayPanel d={s.dayInfo} />}
      </div>
      <div class="spacer" />
      <button tabIndex={-1} type="button" class="px-btn end" disabled={!mine || s.busy} onMouseDown={noFocus} onClick={() => a.endTurn()}>
        {t('endTurn')} <span class="key">E</span>
      </button>
      <button
        tabIndex={-1}
        type="button"
        class="px-btn plain menu-btn"
        aria-label={t('gameMenu')}
        disabled={!mine || s.busy}
        onMouseDown={noFocus}
        onClick={() => a.openGameMenu()}
      >
        <i />
        <i />
        <i />
      </button>
    </div>
  );
}

/** Clima de hoy (y el de mañana si cambia); al pasar por encima, sus efectos. */
function WeatherChip({ w }: { w: WeatherVM }) {
  const tip = `${t('weather')}: ${w.name} — ${w.effects}${w.next ? `\n${t('weatherTomorrow')}: ${w.next}` : ''}`;
  return (
    <span class={`w wx-${w.id}`} title={tip} aria-label={tip}>
      <WeatherIcon id={w.id} />
      <b class="wn">{w.name}</b>
      {w.next && <em class="wf">→ {w.next}</em>}
    </span>
  );
}

function PopMenu({ m }: { m: MenuVM }) {
  const a = ui.actions;
  const sel = m.items[m.selected];
  const withIcons = m.items.some((i) => i.icon);
  return (
    <Popover anchor={m.anchor} prefer="right" class={`pop pop-${m.kind}`} label={m.title}>
      {m.title && <div class="label title">{m.title}</div>}
      {m.subtitle && <div class="sub">{m.subtitle}</div>}
      <div class="scroll" role="menu">
        {m.items.map((it, i) => (
          <>
            {it.danger && i > 0 && <div class="sep" />}
            <button
              tabIndex={-1}
              type="button"
              role="menuitem"
              class={`item ${withIcons ? 'icon' : ''} ${i === m.selected ? 'sel' : ''} ${it.disabled ? 'disabled' : ''} ${it.danger ? 'danger' : ''}`}
              aria-disabled={it.disabled}
              onMouseDown={noFocus}
              onMouseEnter={() => a.menuHover(i)}
              onClick={() => a.menuPick(i)}
              ref={(el) => {
                if (el && i === m.selected) el.scrollIntoView({ block: 'nearest' });
              }}
            >
              {it.icon !== undefined && <Icon k={it.icon} />}
              <span>{it.label}</span>
              {it.hint && <span class="hint">{it.hint}</span>}
            </button>
          </>
        ))}
      </div>
      {sel?.detail && <div class="detail">{sel.detail}</div>}
    </Popover>
  );
}

function pct(p: number): string {
  if (p <= 0) return '0%';
  if (p >= 1) return '100%';
  if (p < 0.01) return t('lessThan1');
  if (p > 0.99) return t('moreThan99');
  return `${Math.round(p * 100)}%`;
}

function Forecast({ f }: { f: ForecastVM }) {
  // Barra de la vida enemiga: lo que seguro queda | lo que puede perder | lo que seguro pierde | vacio.
  const safe = Math.max(0, f.lifeBefore - f.high);
  const maybe = Math.max(0, Math.min(f.lifeBefore, f.high) - Math.min(f.lifeBefore, f.low));
  const sure = Math.min(f.lifeBefore, f.low);
  const empty = Math.max(0, 100 - f.lifeBefore);
  return (
    <Popover anchor={f.anchor} prefer="left" class="forecast" label={t('forecast')}>
      <span class="label">{t('forecast')}</span>
      <div class="vs">
        <Icon k={f.attackerIcon} />
        <span class="range num">{f.low === f.high ? f.low : `${f.low}–${f.high}`}</span>
        <Icon k={f.defenderIcon} />
      </div>
      <div class="lifebar" aria-hidden="true">
        {safe > 0 && <span style={{ flex: safe, background: 'var(--red)' }} />}
        {maybe > 0 && <span style={{ flex: maybe, background: 'repeating-linear-gradient(90deg, var(--red) 0 4px, #6b1f1c 4px 8px)' }} />}
        {sure > 0 && <span style={{ flex: sure, background: '#6b1f1c' }} />}
        {empty > 0 && <span style={{ flex: empty, background: 'var(--slot)' }} />}
      </div>
      <div class="row">
        <span>{t('enemyLife')}</span>
        <span style={{ color: 'var(--gold)' }}>
          {f.lifeBefore} → {f.lifeAfter}
        </span>
      </div>
      <div class="row">
        <span>{t('destroyIt')}</span>
        <span style={{ color: f.killChance >= 0.5 ? 'var(--gold)' : undefined }}>{pct(f.killChance)}</span>
      </div>
      {f.counter ? (
        <>
          <div class="row">
            <span>{t('counter')}</span>
            <span style={{ color: 'var(--red-soft)' }}>
              {f.counter.low === f.counter.high ? f.counter.low : `${f.counter.low}–${f.counter.high}`}
            </span>
          </div>
          <div class="row">
            <span>{t('yourLife')}</span>
            <span style={{ color: f.counter.killChance >= 0.2 ? 'var(--red-soft)' : 'var(--blue)' }}>
              {f.counter.lifeBefore} → {f.counter.lifeAfter}
              {f.counter.killChance >= 0.01 ? ` (${t('dies')} ${pct(f.counter.killChance)})` : ''}
            </span>
          </div>
        </>
      ) : (
        <div class="row muted">
          <span>{t('counter')}</span>
          <span>{t('none')}</span>
        </div>
      )}
    </Popover>
  );
}

function Blocks({ life, team }: { life: number; team: 0 | 1 }) {
  const n = Math.ceil(Math.max(0, life) / 10);
  const color = team === 0 ? 'var(--blue)' : 'var(--red)';
  return (
    <div class="blocks" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span style={i < n ? { background: life <= 30 && i < n ? 'var(--gold)' : color } : undefined} />
      ))}
    </div>
  );
}

/** Un lado del panel de combate: retrato, papel en el combate, vida que baja y acierto. */
function CombatSide({ c, counter, align }: { c: CombatSideVM; counter: boolean; align: 'left' | 'right' }) {
  const role = c.role === 'attacker' ? t('combatAttacks') : counter ? t('combatCounter') : t('combatDefends');
  const tone = c.team === 0 ? 'blue' : 'red';
  return (
    <div class={`px combat-side ${tone} ${align}${c.ko ? ' ko' : ''}`}>
      <div class="cs-head">
        <span class="cs-portrait">
          <Icon k={c.icon} alt={c.name} cls="px-icon" />
          {c.ko && <span class="cs-ko">{t('combatKO')}</span>}
        </span>
        <div class="cs-info">
          <span class="cs-name">
            {c.name}
            {c.rank ? <span class="rank">{' ' + '★'.repeat(c.rank)}</span> : null}
          </span>
          <span class={`cs-role ${c.role}`}>{role}</span>
          {c.hit !== null && (
            <span class="muted cs-hit">
              {t('combatHit')} {pct(c.hit)}
            </span>
          )}
        </div>
      </div>
      <div class="cs-life" title={t('hp')}>
        <div class="cs-bar" aria-hidden="true">
          <span class="trail" style={{ width: `${c.life}%` }} />
          <span class="fill" style={{ width: `${c.life}%` }} />
        </div>
        <span class="cs-v num">{c.life}</span>
        {/* Hueco fijo para el daño: que la barra no cambie de ancho cuando aparece. */}
        <span key={c.hurt ?? 'none'} class={`cs-hurt${c.hurt === 0 ? ' miss' : ''}`}>
          {c.hurt === null ? '' : c.hurt > 0 ? `-${c.hurt}` : t('fxMiss')}
        </span>
      </div>
    </div>
  );
}

/** Panel de combate: abajo en el centro mientras se anima un ataque (ver CombatVM). */
function CombatPanel({ c }: { c: CombatVM }) {
  return (
    <div key={c.id} class={`combat stage-${c.stage}`} role="status" aria-live="polite" aria-label={t('combat')}>
      <CombatSide c={c.left} counter={c.counter} align="left" />
      <span class="combat-vs">VS</span>
      <CombatSide c={c.right} counter={c.counter} align="right" />
    </div>
  );
}

function UnitCard({ u, folded = false }: { u: UnitVM; folded?: boolean }) {
  return (
    <div class="px unitcard">
      <FoldMark folded={folded} />
      <div class="head">
        <Icon k={u.icon} alt={u.name} cls="px-icon portrait" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span class="name">
            {u.name}
            {u.rank ? (
              <span class="rank" title={t('veteran')}>
                {' ' + '★'.repeat(u.rank)}
              </span>
            ) : null}
          </span>
          <span style={{ fontSize: 13, color: u.team === 0 ? 'var(--blue)' : 'var(--red-soft)' }}>
            {u.team === 0 ? t('you') : t('enemy')}
          </span>
          {folded ? null : u.chips ? (
            <span class="chips">
              {u.chips.map((c) => (
                <span class="chip" title={c.title} key={c.icon}>
                  <Icon k={c.icon} alt={c.title} cls="px-icon ico" />
                  <span class="num">{c.text}</span>
                </span>
              ))}
            </span>
          ) : (
            <span class="muted" style={{ fontSize: 13 }}>
              {u.stats}
            </span>
          )}
        </div>
      </div>
      <div class="meter" title={t('hp')}>
        <Icon k="ui/vida" alt={t('hp')} />
        <Blocks life={u.life} team={u.team} />
        <span class="v">{u.life}</span>
      </div>
      {!folded && u.cargo && (
        <span class="muted" style={{ fontSize: 13 }}>
          {u.cargo}
        </span>
      )}
      {!folded && u.abilities && u.abilities.length > 0 && (
        <ul class="abilities" aria-label={t('abilities')}>
          {u.abilities.map((a) => (
            <li title={a.desc}>
              <span class="gold">{a.name}</span>
              <span class="muted">{a.desc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TerrainCard({ tile, folded = false }: { tile: TileVM; folded?: boolean }) {
  const stars = Math.max(0, Math.min(4, Math.round(tile.terrain.defense / 10)));
  const b = tile.building;
  const ownerColor = !b ? undefined : b.owner === 'you' ? 'var(--blue)' : b.owner === 'enemy' ? 'var(--red-soft)' : 'var(--muted)';
  const ownerText = !b
    ? ''
    : b.owner === 'you'
      ? t('you')
      : b.owner === 'enemy'
        ? t('enemy')
        : b.owner === 'neutral'
          ? t('neutral')
          : t('unknown');
  return (
    <div class="px terrain">
      <FoldMark folded={folded} />
      {b ? (
        <div class="bld">
          <Icon k={b.icon} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span class="name" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
              {b.name}
            </span>
            <span style={{ color: ownerColor, fontSize: 13 }}>{ownerText}</span>
          </div>
        </div>
      ) : (
        <span class="swatch" style={{ backgroundImage: `url(${imgUrl(tile.terrain.key)})` }} />
      )}
      <span class="tname" style={{ fontFamily: 'var(--display)', fontSize: 14 }}>
        {tile.terrain.name}
      </span>
      {!folded && (
        <>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}
            title={`${t('defense')} ${tile.terrain.defense}%`}
          >
            <Icon k="ui/defensa" alt={t('defense')} cls="px-icon ico" />
            <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{'★'.repeat(stars) + '☆'.repeat(4 - stars)}</span>
          </div>
          {tile.terrain.cost && (
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}
              title={t('stepCostTitle')}
            >
              <Icon k="ui/movimiento" alt={t('stepCost')} cls="px-icon ico" />
              <span>
                {t('onFoot')} {tile.terrain.cost.foot ?? '—'} · {t('byVehicle')} {tile.terrain.cost.vehicle ?? '—'}
              </span>
            </div>
          )}
          {b?.capture && (
            <div class="capbar" title={`${t('captureLeft')}: ${b.capture.left}/${b.capture.total}`}>
              <Icon k="ui/captura" alt={t('capturing')} cls="px-icon ico" />
              <div class="blocks">
                <span style={{ flex: b.capture.total - b.capture.left, background: b.capture.team === 0 ? 'var(--blue)' : 'var(--red)' }} />
                <span style={{ flex: b.capture.left }} />
              </div>
              <span class="num" style={{ fontSize: 12 }}>
                {b.capture.left}
              </span>
            </div>
          )}
          {b && b.income > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }} title={t('income')}>
              <Icon k="ui/dinero" alt={t('income')} cls="px-icon ico" />
              <span>+{fmtNum(b.income)}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TRAY_MAX = 8;

/** Pantallas donde se pueden plegar paneles (las mismas que en hud.css, "Plegar"). */
const FOLD_SCREEN = '(max-width: 720px), (max-height: 500px)';
const folded = new Set<string>();
/** Panel plegable en el movil (bandeja, fichas): se recuerda mientras dura la sesion. */
function useFold(key: string): [boolean, () => void] {
  const [on, setOn] = useState(folded.has(key));
  const toggle = () => {
    if (!matchMedia(FOLD_SCREEN).matches) return;
    if (on) folded.delete(key);
    else folded.add(key);
    setOn(!on);
  };
  return [on && matchMedia(FOLD_SCREEN).matches, toggle];
}

/** Flecha de plegar (solo se ve en el movil). */
const FoldMark = ({ folded }: { folded: boolean }) => (
  <span class="fold-mark" aria-hidden="true">
    {folded ? '▸' : '▾'}
  </span>
);

function Tray({ idle, threat }: { idle: IdleVM[]; threat: boolean }) {
  const a = ui.actions;
  const [folded, toggleFold] = useFold('tray');
  return (
    <div class={`px tray ${folded ? 'folded' : ''}`}>
      <div class="label tray-head" onClick={toggleFold} aria-expanded={!folded}>
        <span>
          <FoldMark folded={folded} />
          {t('idle')} · {idle.length}
        </span>
        {idle.length > 0 && (
          <span class="key-hint" style={{ color: 'var(--gold)' }}>
            TAB
          </span>
        )}
      </div>
      {idle.length > 0 ? (
        <div class="slots">
          {idle.slice(0, TRAY_MAX).map((u) => (
            <button tabIndex={-1} type="button" title={u.name} aria-label={u.name} onMouseDown={noFocus} onClick={() => a.focusUnit(u.uid)}>
              <Icon k={u.icon} alt={u.name} />
            </button>
          ))}
          {idle.length > TRAY_MAX && <span class="more">+{idle.length - TRAY_MAX}</span>}
        </div>
      ) : (
        <span class="all">{t('allMoved')}</span>
      )}
      <button
        tabIndex={-1}
        type="button"
        class={`px-btn plain threat ${threat ? 'on' : ''}`}
        onMouseDown={noFocus}
        onClick={() => a.toggleThreat()}
        aria-pressed={threat}
      >
        <span class="key">T</span>
        <span class="long">{threat ? t('threatOn') : t('threatOff')}</span>
        <span class="short">{t('threatShort')}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minimapa: 4 px por casilla, niebla oscurecida, edificios y unidades de colores
// ---------------------------------------------------------------------------

const MM = 4;
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const TEAM_COLOR = ['#3aa8ff', '#ff4d45'] as const;

function Minimap({ m, view }: { m: MinimapVM; view: UIState['minimapView'] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    for (let y = 0; y < m.h; y++)
      for (let x = 0; x < m.w; x++) {
        ctx.fillStyle = hex(m.terrain[y * m.w + x] ?? 0);
        ctx.fillRect(x * MM, y * MM, MM, MM);
      }
    ctx.fillStyle = 'rgba(5,8,12,0.45)';
    for (let x = 0; x < m.w; x++) for (let y = 0; y < m.h; y++) if (!m.fog[x]?.[y]) ctx.fillRect(x * MM, y * MM, MM, MM);
    for (const b of m.buildings) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(b.x * MM, b.y * MM, MM, MM);
      ctx.fillStyle = b.owner === null ? '#c9d2e3' : TEAM_COLOR[b.owner];
      ctx.fillRect(b.x * MM + 1, b.y * MM + 1, MM - 2, MM - 2);
    }
    for (const u of m.units) {
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(u.x * MM, u.y * MM, MM, MM);
      ctx.fillStyle = u.team === 0 ? '#8fd0ff' : '#ff8a80';
      ctx.fillRect(u.x * MM + 1, u.y * MM + 1, MM - 2, MM - 2);
    }
  }, [m]);
  const jump = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    ui.actions.minimapJump(((e.clientX - r.left) / r.width) * m.w, ((e.clientY - r.top) / r.height) * m.h);
  };
  const kx = 100 / m.w,
    ky = 100 / m.h;
  return (
    <div class="px minimap" title={t('minimap')}>
      <div
        class="mm-wrap"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) jump(e);
        }}
      >
        <canvas ref={ref} width={m.w * MM} height={m.h * MM} />
        <span
          class="mm-view"
          style={{ left: `${view.x * kx}%`, top: `${view.y * ky}%`, width: `${view.w * kx}%`, height: `${view.h * ky}%` }}
        />
      </div>
    </div>
  );
}

/** Etiqueta pequeña encima de la casilla al mover: no tapa el mapa ni recibe clics. */
function MoveTip({ m }: { m: MoveTipVM }) {
  const a = scaled(m.anchor);
  const left = Math.round(a.x + a.w + 6);
  const top = Math.round(a.y - 30);
  return (
    <div
      class={`px movetip ${m.invalid ? 'bad' : ''}`}
      style={{ left: Math.min(left, window.innerWidth / zoom() - 200), top: Math.max(76, top) }}
    >
      <span class="mt-act">{m.action}</span>
      {m.used !== undefined && (
        <span class="num">
          {m.used}/{m.max}
        </span>
      )}
      {m.stars !== undefined && m.stars > 0 && <span class="gold">{'★'.repeat(m.stars)}</span>}
      {m.danger && (
        <span class="mt-danger" title={t('tipDanger')}>
          ⚠
        </span>
      )}
    </div>
  );
}

/** Fichas de abajo: terreno y unidad. En el movil, tocar una las pliega (las dos) o despliega. */
function Cards({ tile }: { tile: TileVM }) {
  const [folded, toggleFold] = useFold('cards');
  return (
    <div class={`cards ${folded ? 'folded' : ''}`} onClick={toggleFold} aria-expanded={!folded}>
      <TerrainCard tile={tile} folded={folded} />
      {tile.unit && <UnitCard u={tile.unit} folded={folded} />}
    </div>
  );
}

function GameHud({ s }: { s: UIState }) {
  const showCards = !s.busy && s.turn === 'player' && s.tile;
  return (
    <>
      <TopBar s={s} />
      {s.general && <GeneralPanel g={s.general} mine={s.turn === 'player'} />}
      {s.mission && s.turn === 'player' && <MissionPanel m={s.mission} />}
      {s.hint && <div class="hintline">{s.hint}</div>}
      {showCards && <Cards tile={s.tile!} />}
      <div class="side">
        {s.minimap && s.minimapOn && <Minimap m={s.minimap} view={s.minimapView} />}
        {!s.busy && s.turn === 'player' && <Tray idle={s.idle} threat={s.threat} />}
      </div>
      {s.moveTip && <MoveTip m={s.moveTip} />}
      {s.forecast && <Forecast f={s.forecast} />}
      {s.combat && <CombatPanel c={s.combat} />}
      {s.menu && (s.menu.kind === 'game' ? <Pause m={s.menu} /> : <PopMenu m={s.menu} />)}
    </>
  );
}

// ---------------------------------------------------------------------------
// Otras pantallas
// ---------------------------------------------------------------------------

function Help() {
  const h = helpText();
  return (
    <div class="help-veil" onPointerDown={(e) => e.target === e.currentTarget && ui.actions.closeHelp()}>
      <div class="px help" role="dialog" aria-label={h.title}>
        <div class="help-head">
          <span class="htitle">{h.title}</span>
          <button tabIndex={-1} type="button" class="px-btn plain" onMouseDown={noFocus} onClick={() => ui.actions.closeHelp()}>
            {h.close} <span class="key">Esc</span>
          </button>
        </div>
        <div class="help-body">
          <section>
            <span class="label">{h.goalTitle}</span>
            {h.goal.map((p) => (
              <p>{p}</p>
            ))}
            <span class="label">{h.colorsTitle}</span>
            <ul class="legend">
              {h.colors.map(([c, txt]) => (
                <li>
                  <i style={{ background: c }} />
                  {txt}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <span class="label">{h.controlsTitle}</span>
            <table>
              <thead>
                <tr>
                  {h.head.map((x) => (
                    <th>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {h.controls.map((row) => (
                  <tr>{row.map((x, i) => (i === 1 ? <td class="kbd">{x}</td> : <td>{x}</td>))}</tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

function MissionPanel({ m }: { m: NonNullable<UIState['mission']> }) {
  return (
    <div class="px missionpanel" role="status">
      <span class="label">{m.title}</span>
      <span class="mp-obj">{m.objective}</span>
      {m.status && <span class="mp-status">{m.status}</span>}
      {m.tip && (
        <div class="mp-tip">
          {m.step && <span class="key">{m.step}</span>} {m.tip}
        </div>
      )}
    </div>
  );
}

export function Hud() {
  const s = useUI();
  return (
    <>
      {s.screen === 'loading' && (
        <div class="px loading">
          <span class="label">{t('loading')}</span>
          <div class="bar">
            <span style={{ width: `${Math.round(s.loading * 100)}%` }} />
          </div>
        </div>
      )}
      {(s.screen === 'menu' || s.screen === 'setup' || s.screen === 'campaign') && <div class="menu-veil" />}
      {s.screen === 'menu' && <Home s={s} />}
      {s.screen === 'setup' && <NewGame s={s} />}
      {s.screen === 'campaign' && <Campaign s={s} />}
      {s.screen === 'game' && <GameHud s={s} />}
      {s.screen === 'end' && s.end && <EndScreen e={s.end} />}
      {s.options && <Options o={s.options} />}
      {s.help && <Help />}
      {s.notes && <PatchNotes n={s.notes} />}
      {s.toast && (
        <div
          key={s.toast.id}
          class="px toast"
          role="status"
          style={{ animationDuration: `${Math.max(2.4, s.toast.text.length / 16).toFixed(1)}s` }}
        >
          {s.toast.text}
        </div>
      )}
      {s.report && s.screen === 'game' && (
        <div key={s.report.id} class="px report" role="status">
          <span class="label">{s.report.title}</span>
          {s.report.lines.map((l) => (
            <div class={`line ${l.tone}`}>
              {l.weather ? <WeatherIcon id={l.weather} cls="px-icon wx-icon" /> : <Icon k={l.icon} />}
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      )}
      {s.banner && (
        <div key={s.banner.id} class={`banner ${s.banner.tone === 'red' ? 'red' : ''}`} aria-live="polite">
          <span class="s">{s.banner.small}</span>
          <span class="b">{s.banner.big}</span>
        </div>
      )}
    </>
  );
}
