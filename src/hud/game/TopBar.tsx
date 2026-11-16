import { fmtNum, t, type TextKey } from '../../settings';
import { Icon } from '../common/Icon';
import { Chip, Pill } from '../common/toy';
import { useTipToggle } from '../common/useTipToggle';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';
import { ui } from '../store';
import type { WeatherVM } from '../vm/topBar';
import type { Side } from '../vm/common';
import { DayPanel, EconomyPanel } from './Breakdown';
import { keyLabelOf } from '../keyLabels';
import { canAct, canUseMenuButton } from './turn';

/** " · 12/40" con el icono de mando (solo con la regla de puntos de mando). */
function CommandPoints({ points }: { points: NonNullable<UIState['commandPoints']> }) {
  return (
    <span class="cmd" title={t('commandShort')}>
      {' · '}
      <Icon k="ui/mando" alt={t('commandShort')} cls="px-icon ico-sm" />
      {points.used}/{points.max}
    </span>
  );
}

/** Dinero, ingresos por dia y edificios; al pasar por encima o tocarlo, el desglose. */
function Funds({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <Pill cls={`funds has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      <Icon k="ui/dinero" alt="" cls="px-icon coin" />
      <div>
        <div class="amount num">{fmtNum(s.funds)}</div>
        <div class="sub">
          {s.income < 0 ? '−' : '+'}
          {fmtNum(Math.abs(s.income))} {t('perDay')} · {s.buildings} {t('buildingsN')}
          {s.commandPoints ? <CommandPoints points={s.commandPoints} /> : null}
        </div>
      </div>
      {s.economy && <EconomyPanel economy={s.economy} />}
    </Pill>
  );
}

/** De quien es el turno: el suyo, el de un aliado (en azul, como lo suyo) o el de un enemigo (en rojo). */
const TURN_TEXT: Record<Side, TextKey> = { own: 'yourTurn', ally: 'allyTurn', enemy: 'enemyTurn' };

/** Dia (y limite), de quien es el turno y el clima; al pasar por encima o tocarlo, el desglose. */
function Day({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <Pill cls={`day has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      <span class="d">
        {t('day')} {s.day}
        {s.dayLimit ? <span class="dl">/{s.dayLimit}</span> : null}
      </span>
      <span class={`t ${s.turn === 'enemy' ? 'enemy' : ''}`}>{t(TURN_TEXT[s.turn])}</span>
      {s.weather && <WeatherChip weather={s.weather} />}
      {s.dayInfo && <DayPanel dayInfo={s.dayInfo} />}
    </Pill>
  );
}

/**
 * Fin del turno, abajo a la derecha: la ficha grande, con cuantas unidades quedan sin mover y, al primer
 * clic con unidades sin mover, "¿Terminar?" en rojo.
 */
export function EndTurnChip({ s }: { s: UIState }) {
  const { pending, armed } = s.endTurn;
  const pendingLabel = pending > 0 ? ` (${pending} ${t('endTurnIdle')})` : '';
  return (
    <div class="end-dock">
      <Chip
        label={`${t('endTurn')}${pendingLabel}`}
        text={armed ? t('endTurnConfirm') : t('endTurn')}
        badge={canAct(s) && pending > 0 ? pending : null}
        tone={armed ? 'enemy' : 'own'}
        size="lg"
        cls={`end ${armed ? 'armed' : ''}`}
        disabled={!canAct(s)}
        onClick={() => ui.actions.endTurn()}
      >
        <span class="key">{keyLabelOf('endTurn')}</span>
      </Chip>
    </div>
  );
}

/** Barra de arriba: dinero (con su desglose) a la izquierda, dia y clima en medio y el menu a la derecha. */
export function TopBar({ s }: { s: UIState }) {
  return (
    <div class="top">
      <Funds s={s} />
      <Day s={s} />
      <div class="spacer" />
      <Chip label={t('gameMenu')} cls="menu-btn" disabled={!canUseMenuButton(s)} onClick={() => ui.actions.openGameMenu()}>
        <i />
        <i />
        <i />
      </Chip>
    </div>
  );
}

/** Clima de hoy (y el de mañana si cambia); al pasar por encima, sus efectos. */
function WeatherChip({ weather }: { weather: WeatherVM }) {
  const tomorrow = weather.next ? `\n${t('weatherTomorrow')}: ${weather.next}` : '';
  const tip = `${t('weather')}: ${weather.name} — ${weather.effects}${tomorrow}`;
  return (
    <span class={`w wx-${weather.id}`} title={tip} aria-label={tip}>
      <WeatherIcon id={weather.id} />
      <b class="wn">{weather.name}</b>
      {weather.next && <em class="wf">→ {weather.next}</em>}
    </span>
  );
}
