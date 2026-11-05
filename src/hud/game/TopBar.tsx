import { fmtNum, t, type TextKey } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { useTipToggle } from '../common/useTipToggle';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';
import { ui } from '../store';
import type { WeatherVM } from '../vm/topBar';
import type { Side } from '../vm/common';
import { DayPanel, EconomyPanel } from './Breakdown';
import { canAct } from './turn';

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
    <div class={`px funds has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
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
    </div>
  );
}

/** De quien es el turno: el suyo, el de un aliado (en azul, como lo suyo) o el de un enemigo (en rojo). */
const TURN_TEXT: Record<Side, TextKey> = { own: 'yourTurn', ally: 'allyTurn', enemy: 'enemyTurn' };

/** Dia (y limite), de quien es el turno y el clima; al pasar por encima o tocarlo, el desglose. */
function Day({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <div class={`day has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      <span class="d">
        {t('day')} {s.day}
        {s.dayLimit ? <span class="dl">/{s.dayLimit}</span> : null}
      </span>
      <span class={`t ${s.turn === 'enemy' ? 'enemy' : ''}`}>{t(TURN_TEXT[s.turn])}</span>
      {s.weather && <WeatherChip weather={s.weather} />}
      {s.dayInfo && <DayPanel dayInfo={s.dayInfo} />}
    </div>
  );
}

/** [CAMBIO] El aviso de unidades sin mover lo da el propio boton: cuantas quedan y, al primer clic, "¿Terminar?". */
function EndTurnButton({ s }: { s: UIState }) {
  const { pending, armed } = s.endTurn;
  return (
    <Button
      class={`px-btn end ${armed ? 'armed' : ''}`}
      disabled={!canAct(s)}
      onClick={() => ui.actions.endTurn()}
      title={pending > 0 ? `${pending} ${t('endTurnIdle')}` : undefined}
    >
      {armed ? t('endTurnConfirm') : t('endTurn')}
      {canAct(s) && pending > 0 && <span class="pending num">{pending}</span>}
      <span class="key">E</span>
    </Button>
  );
}

/** Barra de arriba: dinero (con su desglose), dia y clima, fin de turno y menu de la partida. */
export function TopBar({ s }: { s: UIState }) {
  return (
    <div class="top">
      <Funds s={s} />
      <Day s={s} />
      <div class="spacer" />
      <EndTurnButton s={s} />
      <Button class="px-btn plain menu-btn" aria-label={t('gameMenu')} disabled={!canAct(s)} onClick={() => ui.actions.openGameMenu()}>
        <i />
        <i />
        <i />
      </Button>
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
