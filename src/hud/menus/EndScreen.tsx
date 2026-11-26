import { fmtNum, t, type TextKey } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import { OWN, RIVALS, type BySide, type SideIndex } from '../vm/common';
import { TextEntry } from './TextEntry';

type EndVM = NonNullable<UIState['end']>;

const CHART_WIDTH = 300;
const CHART_HEIGHT = 90;
const CHART_PADDING = 4;
/** Lineas de fondo de la grafica, en fraccion de su altura. */
const CHART_GRID = [0.25, 0.5, 0.75];

/**
 * Camino SVG de un lado en escalones (estilo pixel): de un dia al siguiente, primero en
 * horizontal y luego en vertical.
 */
function stepPath(data: readonly BySide[], side: SideIndex): string {
  const max = Math.max(1, ...data.flat());
  const lastDay = Math.max(1, data.length - 1);
  const x = (day: number) => Math.round(CHART_PADDING + (day / lastDay) * (CHART_WIDTH - 2 * CHART_PADDING));
  const y = (value: number) => Math.round(CHART_HEIGHT - CHART_PADDING - (value / max) * (CHART_HEIGHT - 2 * CHART_PADDING));
  return data.map((values, day) => (day === 0 ? `M${x(0)},${y(values[side])}` : `H${x(day)}V${y(values[side])}`)).join('');
}

/** Grafica pixel del valor de los ejercitos dia a dia. */
function ArmyChart({ data }: { data: readonly BySide[] }) {
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
      <path d={stepPath(data, RIVALS)} class="enemy" />
      <path d={stepPath(data, OWN)} class="you" />
    </svg>
  );
}

/** El titulo del final para quien mira: en una mision, cumplida o no; si no, victoria, derrota o empate. */
const END_TITLE: Record<'game' | 'mission', Record<EndVM['outcome'], TextKey>> = {
  game: { won: 'victory', lost: 'defeat', draw: 'draw' },
  mission: { won: 'missionWon', lost: 'missionLost', draw: 'missionLost' },
};

const endTitle = (end: EndVM): string => t(END_TITLE[end.mission ? 'mission' : 'game'][end.outcome]);

/** El valor de los ejercitos dia a dia, en su ficha oscura a la derecha (como «Cómo va» en la pausa). */
function ChartSection({ chart }: { chart: readonly BySide[] }) {
  return (
    <section class="end-chart" aria-label={t('endChart')}>
      <span class="end-chart-title">{t('endChart')}</span>
      <ArmyChart data={chart} />
      <span class="legend">
        <i class="you" /> {t('youShort')} <i class="enemy" /> {t('enemy')}
      </span>
    </section>
  );
}

/** Una cifra del final: su nombre y su valor ya escrito. */
interface Figure {
  label: TextKey;
  value: string;
}

/** Las cifras de la partida, grandes y sin tabla: dias, bajas de cada lado, edificios y, con limite de dias, los puntos. */
function endFigures({ day, stats, buildings, score }: EndVM): Figure[] {
  const lost: Figure[] = stats
    ? [
        { label: 'statLost', value: fmtNum(stats.lost[OWN]) },
        { label: 'endDestroyed', value: fmtNum(stats.lost[RIVALS]) },
      ]
    : [];
  const points: Figure[] = score ? [{ label: 'points', value: `${fmtNum(score[OWN])} – ${fmtNum(score[RIVALS])}` }] : [];
  return [
    { label: 'endDaysPlayed', value: fmtNum(day) },
    ...lost,
    { label: 'endBuildings', value: `${buildings.own} ${t('of')} ${buildings.total}` },
    ...points,
  ];
}

function Figures({ end }: { end: EndVM }) {
  return (
    <dl class="end-figures">
      {endFigures(end).map(({ label, value }) => (
        <div key={label} class="end-figure">
          <dt>{t(label)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mirando el tablero: solo el boton para volver al resultado. */
function PeekBar() {
  return (
    <div class="end-peek">
      <Btn cls="end-peek-back" sound="ui_back" onPick={() => ui.actions.endBack()}>
        {t('endBoardBack')} <span class="key">Esc</span>
      </Btn>
    </div>
  );
}

/**
 * Final de la partida, como el menu clasico de Inicio: a la izquierda lo jugado, el resultado en
 * grande, sus cifras y que hacer despues; a la derecha, la grafica de los ejercitos.
 */
export function EndScreen({ end }: { end: EndVM }) {
  if (end.peek) return <PeekBar />;
  return (
    <div class={`endscreen ${end.outcome}`} role="dialog" aria-label={endTitle(end)}>
      <div class="end-main">
        <header class="end-head">
          <span class="end-kicker">{end.kicker}</span>
          <h1 class="end-title">{endTitle(end)}</h1>
          {end.reasonText && <span class="end-reason">{t(end.reasonText)}</span>}
        </header>
        <Figures end={end} />
        {end.best !== null && (
          <span class={`end-best ${end.newBest ? 'new' : ''}`}>
            {end.newBest ? t('newBest') : t('bestDays')}: {end.best} {t('days')}
          </span>
        )}
        <nav class="text-list end-list" aria-label={endTitle(end)}>
          {end.buttons.map((button, index) => (
            <TextEntry
              key={button.id}
              sel={index === end.selected}
              title={button.label}
              onHover={() => ui.actions.endHover(index)}
              onPick={() => ui.actions.endPick(index)}
            />
          ))}
        </nav>
        <span class="menu-hint">{t('homeHint')}</span>
      </div>
      {end.chart && <ChartSection chart={end.chart} />}
    </div>
  );
}
