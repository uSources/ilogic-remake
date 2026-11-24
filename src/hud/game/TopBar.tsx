import { fmtNum, t, type TextKey } from '../../settings';
import { Button } from '../common/buttons';
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
import { canAct, canUseMenuButton, isOwnTurn } from './turn';

/** El dinero; al pasar por encima o tocarlo, el desglose (ingresos, mantenimiento, puntos de mando). */
function Funds({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <Pill cls={`funds has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      <Icon k="ui/dinero" alt="" cls="px-icon coin" />
      <span class="amount num">{fmtNum(s.funds)}</span>
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
      {s.turn !== 'own' && <span class={`t ${s.turn === 'enemy' ? 'enemy' : ''}`}>{t(TURN_TEXT[s.turn])}</span>}
      {s.weather && <WeatherChip weather={s.weather} />}
      {s.dayInfo && <DayPanel dayInfo={s.dayInfo} />}
    </Pill>
  );
}

/** Por la red, en los ultimos segundos del reloj del turno propio: «Fin del turno» parpadea. */
const isTurnEnding = (s: UIState) => isOwnTurn(s) && s.turnClock?.mood === 'hurry';

/**
 * Fin del turno, abajo a la derecha: la ficha grande y, en su esquina, cuantas unidades quedan sin
 * mover (pulsarlo lleva a la siguiente, como Tab). Al primer clic con unidades sin mover,
 * "¿Terminar?" en rojo; por la red, parpadea cuando se acaba el tiempo.
 */
export function EndTurnChip({ s }: { s: UIState }) {
  const { pending, armed } = s.endTurn;
  const showsPending = canAct(s) && pending > 0;
  return (
    <div class="end-dock">
      <Chip
        label={`${t('endTurn')} (${keyLabelOf('endTurn')})`}
        text={armed ? t('endTurnConfirm') : t('endTurn')}
        tone={armed ? 'enemy' : 'own'}
        size="lg"
        cls={`end ${armed ? 'armed' : ''} ${isTurnEnding(s) ? 'hurry' : ''}`}
        disabled={!canAct(s)}
        onClick={() => ui.actions.endTurn()}
      />
      {showsPending && (
        <Button
          class="end-pending num"
          title={`${pending} ${t('endTurnIdle')} (${keyLabelOf('nextUnit')})`}
          aria-label={`${pending} ${t('endTurnIdle')}`}
          onClick={() => ui.actions.nextIdle()}
        >
          {pending}
        </Button>
      )}
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
