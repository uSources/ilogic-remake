import { fmtNum, t } from '../../settings';
import { pct, range } from '../common/format';
import { Icon } from '../common/Icon';
import { Popover } from '../common/Popover';
import type { ForecastVM } from '../vm/combat';

const FULL_LIFE = 100;
/** Desde esta probabilidad de destruirlo, se resalta en dorado. */
const LIKELY_KILL = 0.5;
/** Desde esta probabilidad de que caiga tu unidad en el contraataque, tu vida sale en rojo. */
const RISKY_COUNTER = 0.2;
/** Por debajo de esta probabilidad no se dice "(cae x%)". */
const MENTION_DEATH = 0.01;
const LOST_LIFE_COLOR = '#6b1f1c';

/**
 * Barra de la vida enemiga en cuatro tramos: lo que seguro le queda, lo que puede perder, lo que
 * seguro pierde y el hueco de la vida que ya no tenia.
 */
function EnemyLifeBar({ forecast }: { forecast: ForecastVM }) {
  const { lifeBefore, low, high } = forecast;
  const surelyKept = Math.max(0, lifeBefore - high);
  const maybeLost = Math.max(0, Math.min(lifeBefore, high) - Math.min(lifeBefore, low));
  const surelyLost = Math.min(lifeBefore, low);
  const alreadyMissing = Math.max(0, FULL_LIFE - lifeBefore);
  return (
    <div class="lifebar" aria-hidden="true">
      {surelyKept > 0 && <span style={{ flex: surelyKept, background: 'var(--red)' }} />}
      {maybeLost > 0 && (
        <span style={{ flex: maybeLost, background: `repeating-linear-gradient(90deg, var(--red) 0 4px, ${LOST_LIFE_COLOR} 4px 8px)` }} />
      )}
      {surelyLost > 0 && <span style={{ flex: surelyLost, background: LOST_LIFE_COLOR }} />}
      {alreadyMissing > 0 && <span style={{ flex: alreadyMissing, background: 'var(--slot)' }} />}
    </div>
  );
}

/** Daño que te devuelve y como queda tu unidad, o "Contraataque: no hay". */
function CounterRows({ counter }: { counter: ForecastVM['counter'] }) {
  if (!counter)
    return (
      <div class="row muted">
        <span>{t('counter')}</span>
        <span>{t('none')}</span>
      </div>
    );
  const deathNote = counter.killChance >= MENTION_DEATH ? ` (${t('dies')} ${pct(counter.killChance)})` : '';
  return (
    <>
      <div class="row">
        <span>{t('counter')}</span>
        <span style={{ color: 'var(--red-soft)' }}>{range(counter.low, counter.high)}</span>
      </div>
      <div class="row">
        <span>{t('yourLife')}</span>
        <span style={{ color: counter.killChance >= RISKY_COUNTER ? 'var(--red-soft)' : 'var(--blue)' }}>
          {counter.lifeBefore} → {counter.lifeAfter}
          {deathNote}
        </span>
      </div>
    </>
  );
}

/** Fila "nombre  valor" con el valor en dorado (flanqueo, botin). */
function GoldRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="row">
      <span>{label}</span>
      <span style={{ color: 'var(--gold)' }}>{value}</span>
    </div>
  );
}

/** Prevision de combate junto al objetivo: daño, vida que le queda, contraataque y extras. */
export function Forecast({ forecast }: { forecast: ForecastVM }) {
  return (
    <Popover anchor={forecast.anchor} prefer="left" class="forecast" label={t('forecast')}>
      <span class="label">{t('forecast')}</span>
      <div class="vs">
        <Icon k={forecast.attackerIcon} />
        <span class="range num">{range(forecast.low, forecast.high)}</span>
        <Icon k={forecast.defenderIcon} />
      </div>
      <EnemyLifeBar forecast={forecast} />
      <div class="row">
        <span>{t('enemyLife')}</span>
        <span style={{ color: 'var(--gold)' }}>
          {forecast.lifeBefore} → {forecast.lifeAfter}
        </span>
      </div>
      <div class="row">
        <span>{t('destroyIt')}</span>
        <span style={{ color: forecast.killChance >= LIKELY_KILL ? 'var(--gold)' : undefined }}>{pct(forecast.killChance)}</span>
      </div>
      {forecast.flank > 0 && <GoldRow label={t('flank')} value={`+${Math.round(forecast.flank * 100)} %`} />}
      {forecast.bounty > 0 && forecast.killChance > 0 && <GoldRow label={t('bounty')} value={`+${fmtNum(forecast.bounty)}`} />}
      <CounterRows counter={forecast.counter} />
    </Popover>
  );
}
