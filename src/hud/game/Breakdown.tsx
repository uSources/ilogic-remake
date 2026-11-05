import { fmtNum, t } from '../../settings';
import { signed } from '../common/format';
import type { BreakdownLineVM, DayInfoVM, EconomyVM } from '../vm/topBar';
import { OWN, RIVALS } from '../vm/common';

/** '+' ingresos, '−' gastos, '' puntos (sin color). */
type Sign = '+' | '−' | '';

const SIGN_CLASS: Record<Sign, string> = { '+': 'pos', '−': 'neg', '': '' };

/** Filas "3 × Ciudad  +3.000", o `empty` si no hay ninguna. */
function BreakdownRows({ lines, sign, empty }: { lines: BreakdownLineVM[]; sign: Sign; empty: string }) {
  if (!lines.length) return <div class="row muted">{empty}</div>;
  return (
    <>
      {lines.map((line) => (
        <div class="row" key={line.label}>
          <span class="n num">{line.count} ×</span>
          <span class="l">{line.label}</span>
          <span class={`v num ${SIGN_CLASS[sign]}`}>
            {sign}
            {fmtNum(line.amount)}
          </span>
        </div>
      ))}
    </>
  );
}

function IncomeSection({ income }: { income: EconomyVM['income'] }) {
  return (
    <>
      <h4>{t('ecoIncome')}</h4>
      <BreakdownRows lines={income.lines} sign="+" empty={t('ecoNoBuildings')} />
      {income.scale !== 1 && (
        <div class="note">
          {t('ecoScale')}: ×{income.scale}
        </div>
      )}
      <div class="row total">
        <span class="l" />
        <span class="v num pos">+{fmtNum(income.total)}</span>
      </div>
    </>
  );
}

function UpkeepSection({ upkeep }: { upkeep: NonNullable<EconomyVM['upkeep']> }) {
  return (
    <>
      <h4>{t('ecoUpkeep')}</h4>
      <BreakdownRows lines={upkeep.lines} sign="−" empty={t('ecoNoUnits')} />
      <div class="row total">
        <span class="l note">
          {Math.round(upkeep.rate * 100)} % {t('ecoUpkeepNote')}
        </span>
        <span class="v num neg">−{fmtNum(upkeep.total)}</span>
      </div>
    </>
  );
}

function CommandSection({ points }: { points: NonNullable<EconomyVM['commandPoints']> }) {
  const free = Math.max(0, points.max - points.used);
  return (
    <>
      <h4>{t('ecoCommand')}</h4>
      <BreakdownRows lines={points.lines} sign="" empty={t('ecoNoUnits')} />
      <div class="row total">
        <span class="l note">
          {free} {t('ecoFree')}
        </span>
        <span class="v num">
          {points.used}/{points.max}
        </span>
      </div>
    </>
  );
}

/** Desglose del dinero (al pasar por encima o tocar el dinero de arriba). */
export function EconomyPanel({ economy }: { economy: EconomyVM }) {
  return (
    <div class="px breakdown" role="tooltip">
      <IncomeSection income={economy.income} />
      {economy.upkeep && <UpkeepSection upkeep={economy.upkeep} />}
      <div class="row net">
        <span class="l">{t('ecoNet')}</span>
        <span class={`v num ${economy.net < 0 ? 'neg' : 'pos'}`}>{signed(economy.net)}</span>
      </div>
      <div class="row">
        <span class="l">{t('ecoNext')}</span>
        <span class="v num gold">{fmtNum(economy.next)}</span>
      </div>
      {economy.shortfall !== null && (
        <div class="note warn">
          {t('ecoShortfall')} {fmtNum(economy.shortfall)}
        </div>
      )}
      {economy.commandPoints && <CommandSection points={economy.commandPoints} />}
    </div>
  );
}

/** "Sin límite de días", "Último día" o "Quedan 5 días". */
function daysLeftText(daysLeft: number | null): string {
  if (daysLeft === null) return t('dayNoLimit');
  if (daysLeft <= 1) return t('dayLeft1');
  return `${t('dayLeft')} ${daysLeft} ${t('days')}`;
}

function ScoreSection({ score }: { score: NonNullable<DayInfoVM['score']> }) {
  const mine = score[OWN];
  const enemy = score[RIVALS];
  return (
    <>
      <h4>{t('dayScore')}</h4>
      <div class="row">
        <span class="l">{t('youShort')}</span>
        <span class="v num pos">{fmtNum(mine)}</span>
      </div>
      <div class="row">
        <span class="l">{t('enemy')}</span>
        <span class="v num neg">{fmtNum(enemy)}</span>
      </div>
      <div class="note">{t('dayScoreNote')}</div>
    </>
  );
}

/** Desglose del dia: limite, lo que queda y los puntos si se acabase ahora. */
export function DayPanel({ dayInfo }: { dayInfo: DayInfoVM }) {
  return (
    <div class="px breakdown" role="tooltip">
      <h4>
        {t('day')} {dayInfo.day}
        {dayInfo.limit !== null && ` ${t('dayOf')} ${dayInfo.limit}`}
      </h4>
      <div class="row">
        <span class="l">{daysLeftText(dayInfo.left)}</span>
      </div>
      {dayInfo.score && <ScoreSection score={dayInfo.score} />}
    </div>
  );
}
