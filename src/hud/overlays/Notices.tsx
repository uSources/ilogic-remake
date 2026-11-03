import { t } from '../../settings';
import { Icon } from '../common/Icon';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';
import type { ReportLineVM } from '../vm/notices';

/** Avisos que salen solos y se van (sus animaciones, en styles/): carga, aviso corto, resumen y cartel. */

/** Un aviso dura al menos esto, en segundos... */
const TOAST_MIN_SECONDS = 2.4;
/** ...o lo que se tarda en leerlo a esta velocidad, si es mas largo. */
const READING_CHARS_PER_SECOND = 16;

/** Barra de carga del arranque (`progress`: 0..1). */
export function Loading({ progress }: { progress: number }) {
  return (
    <div class="px loading">
      <span class="label">{t('loading')}</span>
      <div class="bar">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

/** Aviso corto abajo; dura mas cuanto mas largo es el texto. Se pinta con `key={id}`: un aviso nuevo vuelve a empezar la animacion. */
export function Toast({ toast }: { toast: NonNullable<UIState['toast']> }) {
  const seconds = Math.max(TOAST_MIN_SECONDS, toast.text.length / READING_CHARS_PER_SECOND);
  return (
    <div class="px toast" role="status" style={{ animationDuration: `${seconds.toFixed(1)}s` }}>
      {toast.text}
    </div>
  );
}

function ReportLine({ line }: { line: ReportLineVM }) {
  return (
    <div class={`line ${line.tone}`}>
      {line.weather ? <WeatherIcon id={line.weather} cls="px-icon wx-icon" /> : <Icon k={line.icon} />}
      <span>{line.text}</span>
    </div>
  );
}

/** Resumen de la ronda (ingresos, reparaciones, clima...). */
export function Report({ report }: { report: NonNullable<UIState['report']> }) {
  return (
    <div class="px report" role="status">
      <span class="label">{report.title}</span>
      {report.lines.map((line) => (
        <ReportLine line={line} />
      ))}
    </div>
  );
}

/** Cartel grande de cambio de turno o de dia. */
export function Banner({ banner }: { banner: NonNullable<UIState['banner']> }) {
  return (
    <div class={`banner ${banner.tone === 'red' ? 'red' : ''}`} aria-live="polite">
      <span class="s">{banner.small}</span>
      <span class="b">{banner.big}</span>
    </div>
  );
}
