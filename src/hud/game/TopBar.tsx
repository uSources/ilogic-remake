import { fmtNum, t } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { useTipToggle } from '../common/useTipToggle';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';
import { ui } from '../store';
import type { WeatherVM } from '../vm/topBar';
import { DayPanel, EconomyPanel } from './Breakdown';

/** Barra de arriba: dinero (con su desglose), dia y clima, fin de turno y menu de la partida. */
export function TopBar({ s }: { s: UIState }) {
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
      {/* [CAMBIO] El aviso de unidades sin mover lo da el propio boton: cuantas quedan y, al primer clic, "¿Terminar?". */}
      <Button
        class={`px-btn end ${s.endTurn.armed ? 'armed' : ''}`}
        disabled={!mine || s.busy}
        onClick={() => a.endTurn()}
        title={s.endTurn.pending > 0 ? `${s.endTurn.pending} ${t('endTurnIdle')}` : undefined}
      >
        {s.endTurn.armed ? t('endTurnConfirm') : t('endTurn')}
        {mine && !s.busy && s.endTurn.pending > 0 && <span class="pending num">{s.endTurn.pending}</span>}
        <span class="key">E</span>
      </Button>
      <Button class="px-btn plain menu-btn" aria-label={t('gameMenu')} disabled={!mine || s.busy} onClick={() => a.openGameMenu()}>
        <i />
        <i />
        <i />
      </Button>
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
