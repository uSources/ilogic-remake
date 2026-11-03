import { fmtNum, t } from '../../settings';
import { pct, range } from '../common/format';
import { Icon } from '../common/Icon';
import { Popover } from '../common/Popover';
import type { ForecastVM } from '../vm/combat';

/** Prevision de combate junto al objetivo: daño, vida que le queda, contraataque y extras. */
export function Forecast({ f }: { f: ForecastVM }) {
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
        <span class="range num">{range(f.low, f.high)}</span>
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
      {f.flank > 0 && (
        <div class="row">
          <span>{t('flank')}</span>
          <span style={{ color: 'var(--gold)' }}>+{Math.round(f.flank * 100)} %</span>
        </div>
      )}
      {f.bounty > 0 && f.killChance > 0 && (
        <div class="row">
          <span>{t('bounty')}</span>
          <span style={{ color: 'var(--gold)' }}>+{fmtNum(f.bounty)}</span>
        </div>
      )}
      {f.counter ? (
        <>
          <div class="row">
            <span>{t('counter')}</span>
            <span style={{ color: 'var(--red-soft)' }}>{range(f.counter.low, f.counter.high)}</span>
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
