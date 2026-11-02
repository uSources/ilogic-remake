import { fmtNum, t } from '../../settings';
import { signed } from '../common/format';
import type { BreakdownLineVM, DayInfoVM, EconomyVM } from '../vm/topBar';

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

/** Desglose del dinero (al pasar por encima o tocar el dinero de arriba). */
export function EconomyPanel({ e }: { e: EconomyVM }) {
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
export function DayPanel({ d }: { d: DayInfoVM }) {
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
