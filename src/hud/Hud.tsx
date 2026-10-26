import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'preact/compat';
import { imgUrl } from '../assets';
import { settings, t } from '../settings';
import { ui, type Anchor, type ForecastVM, type IdleVM, type MenuVM, type TileVM, type UIState, type UnitVM } from './store';

function useUI(): UIState {
  return useSyncExternalStore(ui.subscribe, ui.get);
}

/** Evitar que los botones se queden con el foco (Enter los pulsaria ademas de la accion del juego). */
const noFocus = (e: MouseEvent) => e.preventDefault();

const fmt = (n: number) => n.toLocaleString(settings.lang === 'es' ? 'es-ES' : 'en-US');

function Icon({ k, alt = '', cls = 'px-icon' }: { k: string | null | undefined; alt?: string; cls?: string }) {
  const src = imgUrl(k);
  return src ? <img class={cls} src={src} alt={alt} draggable={false} /> : <span class={cls} />;
}

// ---------------------------------------------------------------------------
// Colocacion de bocadillos junto a una casilla
// ---------------------------------------------------------------------------

const MARGIN = 16;
const TOP_SAFE = 80;

function Popover(props: { anchor: Anchor; prefer: 'right' | 'left'; class: string; children: ComponentChildren; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { anchor, prefer } = props;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const vw = window.innerWidth,
      vh = window.innerHeight;
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

function TopBar({ s }: { s: UIState }) {
  const a = ui.actions;
  const mine = s.turn === 'player';
  return (
    <div class="top">
      <div class="px funds">
        <Icon k="currency" alt="" cls="px-icon coin" />
        <div>
          <div class="amount num">{fmt(s.funds)}</div>
          <div class="sub">
            +{fmt(s.income)} {t('perDay')} · {s.buildings} {t('buildingsN')}
          </div>
        </div>
      </div>
      <div class="day">
        <span class="d">
          {t('day')} {s.day}
        </span>
        <span class={`t ${mine ? '' : 'enemy'}`}>{mine ? t('yourTurn') : t('enemyTurn')}</span>
      </div>
      <div class="spacer" />
      <button tabIndex={-1} type="button" class="px-btn end" disabled={!mine || s.busy} onMouseDown={noFocus} onClick={() => a.endTurn()}>
        {t('endTurn')} <span class="key">E</span>
      </button>
      <button tabIndex={-1} type="button" class="px-btn plain menu-btn" aria-label={t('gameMenu')} disabled={!mine || s.busy} onMouseDown={noFocus} onClick={() => a.openGameMenu()}>
        <i />
        <i />
        <i />
      </button>
    </div>
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
            <button tabIndex={-1}
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
      <div class="row muted">
        <span>{t('counter')}</span>
        <span>{t('none')}</span>
      </div>
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

function UnitCard({ u }: { u: UnitVM }) {
  return (
    <div class="px unitcard">
      <div class="head">
        <Icon k={u.icon} alt={u.name} cls="px-icon portrait" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span class="name">{u.name}</span>
          <span style={{ fontSize: 13, color: u.team === 0 ? 'var(--blue)' : 'var(--red-soft)' }}>{u.team === 0 ? t('you') : t('enemy')}</span>
          <span class="muted" style={{ fontSize: 13 }}>
            {u.stats}
          </span>
        </div>
      </div>
      <div class="meter" title={t('hp')}>
        <Icon k="health" alt={t('hp')} />
        <Blocks life={u.life} team={u.team} />
        <span class="v">{u.life}</span>
      </div>
      {(u.fuel || u.ammo) && (
        <div style={{ display: 'flex', gap: 16, fontSize: 15 }}>
          {u.fuel && (
            <span class="meter" title={t('fuel')}>
              <Icon k="fuel" alt={t('fuel')} />
              <span style={{ color: u.fuel.now <= u.fuel.max * 0.25 ? 'var(--gold)' : undefined }}>
                {u.fuel.now}/{u.fuel.max}
              </span>
            </span>
          )}
          {u.ammo && (
            <span class="meter" title={t('ammo')}>
              <Icon k="ammo" alt={t('ammo')} />
              <span style={{ color: u.ammo.now === 0 ? 'var(--red-soft)' : undefined }}>
                {u.ammo.now}/{u.ammo.max}
              </span>
            </span>
          )}
        </div>
      )}
      {u.cargo && <span class="muted" style={{ fontSize: 13 }}>{u.cargo}</span>}
    </div>
  );
}

function TerrainCard({ tile }: { tile: TileVM }) {
  const stars = Math.max(0, Math.min(4, Math.round(tile.terrain.defense / 10)));
  const b = tile.building;
  const ownerColor = !b ? undefined : b.owner === 'you' ? 'var(--blue)' : b.owner === 'enemy' ? 'var(--red-soft)' : 'var(--muted)';
  const ownerText = !b ? '' : b.owner === 'you' ? t('you') : b.owner === 'enemy' ? t('enemy') : b.owner === 'neutral' ? t('neutral') : t('unknown');
  return (
    <div class="px terrain">
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
      <span style={{ fontFamily: 'var(--display)', fontSize: 14 }}>{tile.terrain.name}</span>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }} title={`${t('defense')} ${tile.terrain.defense}%`}>
        <span class="muted">{t('defense')}</span>
        <span style={{ color: 'var(--gold)', letterSpacing: 1 }}>{'★'.repeat(stars) + '☆'.repeat(4 - stars)}</span>
      </div>
      {b && b.income > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
          <span class="muted">{t('income')}</span>
          <span>+{fmt(b.income)}</span>
        </div>
      )}
    </div>
  );
}

const TRAY_MAX = 8;

function Tray({ idle, threat }: { idle: IdleVM[]; threat: boolean }) {
  const a = ui.actions;
  return (
    <div class="px tray">
      <div class="label tray-head">
        <span>
          {t('idle')} · {idle.length}
        </span>
        {idle.length > 0 && <span style={{ color: 'var(--gold)' }}>TAB</span>}
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
      <button tabIndex={-1} type="button" class={`px-btn plain threat ${threat ? 'on' : ''}`} onMouseDown={noFocus} onClick={() => a.toggleThreat()} aria-pressed={threat}>
        <span class="key">T</span>
        <span class="long">{threat ? t('threatOn') : t('threatOff')}</span>
        <span class="short">{t('threatShort')}</span>
      </button>
    </div>
  );
}

function GameHud({ s }: { s: UIState }) {
  const showCards = !s.busy && s.turn === 'player' && s.tile;
  return (
    <>
      <TopBar s={s} />
      {s.hint && <div class="hintline">{s.hint}</div>}
      {showCards && (
        <div class="cards">
          <TerrainCard tile={s.tile!} />
          {s.tile!.unit && <UnitCard u={s.tile!.unit} />}
        </div>
      )}
      {!s.busy && s.turn === 'player' && <Tray idle={s.idle} threat={s.threat} />}
      {s.forecast && <Forecast f={s.forecast} />}
      {s.menu && <PopMenu m={s.menu} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Otras pantallas
// ---------------------------------------------------------------------------

function MainMenu({ s }: { s: UIState }) {
  const a = ui.actions;
  return (
    <>
      <div class="mainmenu">
        <Icon k="logoilogic" alt="Ilogic" cls="px-icon logo" />
        <div class="list" role="menu">
          {s.mainMenu.items.map((it, i) => (
            <button tabIndex={-1}
              type="button"
              role="menuitem"
              class={`px-btn ${it.primary ? '' : 'plain'} ${i === s.mainMenu.selected ? 'sel' : ''}`}
              disabled={it.disabled}
              onMouseDown={noFocus}
              onMouseEnter={() => !it.disabled && a.mainMenuHover(i)}
              onClick={() => a.mainMenuPick(i)}
            >
              <span>{it.label}</span>
              {it.value && <span class="val">{it.value}</span>}
            </button>
          ))}
        </div>
      </div>
      <div class="credits">Fingerprint Games · 2013 / 2026</div>
    </>
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
      {s.screen === 'menu' && <MainMenu s={s} />}
      {s.screen === 'game' && <GameHud s={s} />}
      {s.screen === 'end' && (
        <button tabIndex={-1} type="button" class="px-btn plain endhint" onMouseDown={noFocus} onClick={() => ui.actions.endContinue()}>
          {t('pressKey')}
        </button>
      )}
      {s.toast && (
        <div key={s.toast.id} class="px toast" role="status">
          {s.toast.text}
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
