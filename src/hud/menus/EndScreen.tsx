import { fmtNum, t, type TextKey } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';

type EndVM = NonNullable<UIState['end']>;
/** Un valor por lado: [tuyo, de tus enemigos] (ver BySide). */
type PerSide = readonly [number, number];

const CHART_WIDTH = 300;
const CHART_HEIGHT = 90;
const CHART_PADDING = 4;
/** Lineas de fondo de la grafica, en fraccion de su altura. */
const CHART_GRID = [0.25, 0.5, 0.75];

/**
 * Camino SVG de un lado en escalones (estilo pixel): de un dia al siguiente, primero en
 * horizontal y luego en vertical.
 */
function stepPath(data: PerSide[], side: 0 | 1): string {
  const max = Math.max(1, ...data.flat());
  const lastDay = Math.max(1, data.length - 1);
  const x = (day: number) => Math.round(CHART_PADDING + (day / lastDay) * (CHART_WIDTH - 2 * CHART_PADDING));
  const y = (value: number) => Math.round(CHART_HEIGHT - CHART_PADDING - (value / max) * (CHART_HEIGHT - 2 * CHART_PADDING));
  return data.map((values, day) => (day === 0 ? `M${x(0)},${y(values[side])}` : `H${x(day)}V${y(values[side])}`)).join('');
}

/** Grafica pixel del valor de los ejercitos dia a dia. */
function ArmyChart({ data }: { data: PerSide[] }) {
  return (
    <svg
      class="chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('endChart')}
      shape-rendering="crispEdges"
    >
      {CHART_GRID.map((fraction) => (
        <line x1={0} x2={CHART_WIDTH} y1={Math.round(CHART_HEIGHT * fraction)} y2={Math.round(CHART_HEIGHT * fraction)} class="grid" />
      ))}
      <path d={stepPath(data, 1)} class="enemy" />
      <path d={stepPath(data, 0)} class="you" />
    </svg>
  );
}

const REASON = { hq: 'endHq', wipeout: 'endWipeout', days: 'endDays', objective: 'endObjective', surrender: 'endSurrender' } as const;

function endTitle(end: EndVM): string {
  if (end.mission) return end.won ? t('missionWon') : t('missionLost');
  return end.won ? t('victory') : t('defeat');
}

function ChartSection({ chart }: { chart: PerSide[] }) {
  return (
    <div class="end-chart">
      <span class="label">{t('endChart')}</span>
      <ArmyChart data={chart} />
      <span class="legend">
        <i class="you" /> {t('you')} <i class="enemy" /> {t('enemy')}
      </span>
    </div>
  );
}

function StatRow({ label, values }: { label: TextKey; values: PerSide }) {
  return (
    <tr>
      <td>{t(label)}</td>
      <td class="num">{fmtNum(values[0])}</td>
      <td class="num">{fmtNum(values[1])}</td>
    </tr>
  );
}

/** Tabla tuyo / enemigo: puntos (si hay limite de dias), compras, bajas, capturas, gasto y dias. */
function StatsTable({ stats, score, day }: { stats: NonNullable<EndVM['stats']>; score: EndVM['score']; day: number }) {
  const rows = [
    ['statBuilt', stats.built],
    ['statLost', stats.lost],
    ['statCaptured', stats.captured],
    ['statSpent', stats.spent],
  ] as const;
  return (
    <table class="endstats">
      <thead>
        <tr>
          <th />
          <th class="you">{t('you')}</th>
          <th class="enemy">{t('enemy')}</th>
        </tr>
      </thead>
      <tbody>
        {score && <StatRow label="points" values={score} />}
        {rows.map(([label, values]) => (
          <StatRow key={label} label={label} values={values} />
        ))}
        <tr>
          <td>{t('statDays')}</td>
          <td class="num" colSpan={2}>
            {day}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Final de la partida: resultado, grafica de los ejercitos, estadisticas y botones. */
export function EndScreen({ end }: { end: EndVM }) {
  return (
    <div class={`endscreen ${end.won ? 'won' : 'lost'}`}>
      <div class="end-head">
        {end.mission && <span class="label">{end.mission}</span>}
        <span class="end-title">{endTitle(end)}</span>
        {end.reason && <span class="end-reason">{t(REASON[end.reason])}</span>}
      </div>
      <div class="px end-card">
        <div class="end-cols">
          {end.chart && <ChartSection chart={end.chart} />}
          {end.stats && <StatsTable stats={end.stats} score={end.score} day={end.day} />}
        </div>
        {end.best !== null && (
          <div class={`end-best ${end.newBest ? 'new' : ''}`}>
            {end.newBest ? t('newBest') : t('bestDays')}: {end.best} {t('days')}
          </div>
        )}
        <div class="end-btns">
          {end.buttons.map((button, i) => (
            <Btn
              key={button.id}
              sel={i === end.selected}
              cls={`px-btn ${i === 0 ? '' : 'plain'}`}
              onHover={() => ui.actions.endHover(i)}
              onPick={() => ui.actions.endPick(i)}
            >
              {button.label}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}
