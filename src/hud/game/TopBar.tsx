import { fmtNum, t, type TextKey } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { useTipToggle } from '../common/useTipToggle';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';
import { ui } from '../store';
import type { StandingVM } from '../vm/menus';
import type { WeatherVM } from '../vm/topBar';
import type { Side } from '../vm/common';
import { signed } from '../common/format';
import { DayPanel, EconomyPanel, WeatherPanel } from './Breakdown';
import { keyLabelOf } from '../keyLabels';
import { canAct, canUseMenuButton, isOwnTurn } from './turn';

/** El dinero y lo que entra al dia; al pasar por encima o tocarlo, el desglose (ingresos, mantenimiento, puntos de mando). */
function Funds({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <span class={`turn-funds has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      <Icon k="ui/dinero" alt="" cls="px-icon coin" />
      <span class="amount num">{fmtNum(s.funds)}</span>
      {s.economy && (
        <span class="per-day num">
          {signed(s.economy.net)} {t('perDay')}
        </span>
      )}
      {s.economy && <EconomyPanel economy={s.economy} />}
    </span>
  );
}

/** De quien es el turno, en grande: el suyo, el de un aliado (en azul, como lo suyo) o el de un enemigo (en rojo). */
const TURN_TITLE: Record<Side, TextKey> = { own: 'turnTitleOwn', ally: 'turnTitleAlly', enemy: 'turnTitleEnemy' };

/** El dia (y su limite); al pasar por encima o tocarlo, el desglose (lo que queda, los puntos). */
function Day({ s }: { s: UIState }) {
  const [isOpen, toggle, close] = useTipToggle();
  return (
    <span class={`turn-day has-tip ${isOpen ? 'open' : ''}`} onClick={toggle} onPointerLeave={close}>
      {t('dayTitle')} {s.day}
      {s.dayLimit ? <span class="dl">/{s.dayLimit}</span> : null}
      {s.dayInfo && <DayPanel dayInfo={s.dayInfo} />}
    </span>
  );
}

/** Arriba a la izquierda: de quien es el turno con el punto de su color y, debajo, el dia, el clima y el dinero. */
function TurnHeader({ s }: { s: UIState }) {
  return (
    <div class="turn-head">
      <span class={`turn-title side-${s.turn}`}>
        <i class="turn-dot" aria-hidden="true" />
        {t(TURN_TITLE[s.turn])}
      </span>
      <div class="turn-line">
        <Day s={s} />
        {s.weather && <WeatherChip weather={s.weather} />}
        <Funds s={s} />
      </div>
    </div>
  );
}

/** «7 unidades», «1 edificio»: el numero con su palabra. */
const counted = (n: number, one: TextKey, many: TextKey): string => (n === 1 ? t(one) : t(many).replace('{n}', fmtNum(n)));

/** Arriba a la derecha: el enemigo, con sus edificios y, si no hay niebla, sus unidades. */
function Rival({ standing }: { standing: StandingVM }) {
  const [, rivalUnits] = standing.units;
  const parts = [
    ...(rivalUnits === null ? [] : [counted(rivalUnits, 'unitsCount1', 'unitsCount')]),
    counted(standing.buildings[1], 'buildingsCount1', 'buildingsCount'),
  ];
  return (
    <div class="rival-head">
      <span class="rival-name">
        <i class="turn-dot" aria-hidden="true" />
        {t('enemy')}
      </span>
      <span class="rival-line">{parts.join(' · ')}</span>
    </div>
  );
}

/** El boton de la pausa, con su tecla. */
function PauseButton({ s }: { s: UIState }) {
  return (
    <Button
      class="pause-btn"
      aria-label={t('gameMenu')}
      title={`${t('gameMenu')} (${keyLabelOf('cancel')})`}
      disabled={!canUseMenuButton(s)}
      onClick={() => ui.actions.openGameMenu()}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="4" width="5" height="16" rx="1" />
        <rect x="14" y="4" width="5" height="16" rx="1" />
      </svg>
      <span class="key">{keyLabelOf('cancel')}</span>
    </Button>
  );
}

/** Por la red, en los ultimos segundos del reloj del turno propio: «Acabar turno» parpadea. */
const isTurnEnding = (s: UIState) => isOwnTurn(s) && s.turnClock?.mood === 'hurry';

/**
 * «Acabar turno», abajo a la derecha junto al minimapa: en texto grande y, debajo, cuantas unidades
 * quedan sin mover (pulsarlo lleva a la siguiente, como Tab). Al primer clic con unidades sin mover,
 * «¿Terminar?» en rojo; por la red, parpadea cuando se acaba el tiempo.
 */
export function EndTurn({ s }: { s: UIState }) {
  const { pending, armed } = s.endTurn;
  const showsPending = canAct(s) && pending > 0;
  return (
    <div class="end-dock">
      <Button
        class={`end-turn ${armed ? 'armed' : ''} ${isTurnEnding(s) ? 'hurry' : ''}`}
        aria-label={`${t('endTurn')} (${keyLabelOf('endTurn')})`}
        title={`${t('endTurn')} (${keyLabelOf('endTurn')})`}
        disabled={!canAct(s)}
        onClick={() => ui.actions.endTurn()}
      >
        {armed ? t('endTurnConfirm') : t('endTurn')}
        <span class="end-arrow" aria-hidden="true">
          ▸
        </span>
      </Button>
      {showsPending && (
        <Button class="end-idle" title={t('nextUnit')} onClick={() => ui.actions.nextIdle()}>
          <span class="num">{pending}</span> {t('endTurnIdle')} <span class="key">{keyLabelOf('nextUnit')}</span>
        </Button>
      )}
    </div>
  );
}

/**
 * Barra de arriba, como el menu clasico (lienzo «Todo en estilo C», «Partida: tu turno»): texto sobre
 * una sombra que baja del borde, sin fichas. A la izquierda, el turno, el dia, el clima y el dinero; a
 * la derecha, el enemigo y la pausa.
 */
export function TopBar({ s }: { s: UIState }) {
  return (
    <div class="top">
      <TurnHeader s={s} />
      <div class="spacer" />
      {s.standing && <Rival standing={s.standing} />}
      <PauseButton s={s} />
    </div>
  );
}

/** Clima de hoy (y el de mañana si cambia); al pasar por encima o tocarlo, sus efectos. */
function WeatherChip({ weather }: { weather: WeatherVM }) {
  const [isOpen, toggle, close] = useTipToggle();
  const tomorrow = weather.next ? `. ${t('weatherTomorrow')}: ${weather.next}` : '';
  return (
    <span
      class={`turn-weather has-tip wx-${weather.id} ${isOpen ? 'open' : ''}`}
      aria-label={`${t('weather')}: ${weather.name}. ${weather.effects}${tomorrow}`}
      onClick={toggle}
      onPointerLeave={close}
    >
      <WeatherIcon id={weather.id} />
      <b class="wn">{weather.name}</b>
      {weather.next && <em class="wf">→ {weather.next}</em>}
      <WeatherPanel weather={weather} />
    </span>
  );
}
