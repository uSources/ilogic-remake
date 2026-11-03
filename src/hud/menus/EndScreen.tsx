import { fmtNum, t } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';

/** Grafica pixel del valor de los ejercitos dia a dia. */
function ArmyChart({ data }: { data: [number, number][] }) {
  const W = 300,
    H = 90,
    pad = 4;
  const max = Math.max(1, ...data.flat());
  const n = data.length;
  const x = (i: number) => Math.round(pad + (i / Math.max(1, n - 1)) * (W - 2 * pad));
  const y = (v: number) => Math.round(H - pad - (v / max) * (H - 2 * pad));
  // Escalones (estilo pixel): horizontal y luego vertical.
  const line = (k: 0 | 1) => data.map((d, i) => (i === 0 ? `M${x(0)},${y(d[k])}` : `H${x(i)}V${y(d[k])}`)).join('');
  return (
    <svg
      class="chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('endChart')}
      shape-rendering="crispEdges"
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line x1={0} x2={W} y1={Math.round(H * f)} y2={Math.round(H * f)} class="grid" />
      ))}
      <path d={line(1)} class="enemy" />
      <path d={line(0)} class="you" />
    </svg>
  );
}

const REASON = { hq: 'endHq', wipeout: 'endWipeout', days: 'endDays', objective: 'endObjective', surrender: 'endSurrender' } as const;

/** Final de la partida: resultado, grafica de los ejercitos, estadisticas y botones. */
export function EndScreen({ e }: { e: NonNullable<UIState['end']> }) {
  const a = ui.actions;
  const title = e.mission ? (e.won ? t('missionWon') : t('missionLost')) : e.won ? t('victory') : t('defeat');
  return (
    <div class={`endscreen ${e.won ? 'won' : 'lost'}`}>
      <div class="end-head">
        {e.mission && <span class="label">{e.mission}</span>}
        <span class="end-title">{title}</span>
        {e.reason && <span class="end-reason">{t(REASON[e.reason])}</span>}
      </div>
      <div class="px end-card">
        <div class="end-cols">
          {e.chart && (
            <div class="end-chart">
              <span class="label">{t('endChart')}</span>
              <ArmyChart data={e.chart} />
              <span class="legend">
                <i class="you" /> {t('you')} <i class="enemy" /> {t('enemy')}
              </span>
            </div>
          )}
          {e.stats && (
            <table class="endstats">
              <thead>
                <tr>
                  <th />
                  <th class="you">{t('you')}</th>
                  <th class="enemy">{t('enemy')}</th>
                </tr>
              </thead>
              <tbody>
                {e.score && (
                  <tr>
                    <td>{t('points')}</td>
                    <td class="num">{fmtNum(e.score[0])}</td>
                    <td class="num">{fmtNum(e.score[1])}</td>
                  </tr>
                )}
                {(
                  [
                    ['statBuilt', e.stats.built],
                    ['statLost', e.stats.lost],
                    ['statCaptured', e.stats.captured],
                    ['statSpent', e.stats.spent],
                  ] as const
                ).map(([k, v]) => (
                  <tr key={k}>
                    <td>{t(k)}</td>
                    <td class="num">{fmtNum(v[0])}</td>
                    <td class="num">{fmtNum(v[1])}</td>
                  </tr>
                ))}
                <tr>
                  <td>{t('statDays')}</td>
                  <td class="num" colSpan={2}>
                    {e.day}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        {e.best !== null && (
          <div class={`end-best ${e.newBest ? 'new' : ''}`}>
            {e.newBest ? t('newBest') : t('bestDays')}: {e.best} {t('days')}
          </div>
        )}
        <div class="end-btns">
          {e.buttons.map((b, i) => (
            <Btn
              key={b.id}
              sel={i === e.selected}
              cls={`px-btn ${i === 0 ? '' : 'plain'}`}
              onHover={() => a.endHover(i)}
              onPick={() => a.endPick(i)}
            >
              {b.label}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}
