import { t } from '../../settings';
import { Icon } from '../common/Icon';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';

/** Avisos que salen solos y se van (sus animaciones, en styles/): carga, aviso corto, resumen y cartel. */

/** Barra de carga del arranque (`p`: 0..1). */
export function Loading({ p }: { p: number }) {
  return (
    <div class="px loading">
      <span class="label">{t('loading')}</span>
      <div class="bar">
        <span style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
    </div>
  );
}

/** Aviso corto abajo; dura mas cuanto mas largo es el texto. Se pinta con `key={id}`: un aviso nuevo vuelve a empezar la animacion. */
export function Toast({ toast }: { toast: NonNullable<UIState['toast']> }) {
  return (
    <div class="px toast" role="status" style={{ animationDuration: `${Math.max(2.4, toast.text.length / 16).toFixed(1)}s` }}>
      {toast.text}
    </div>
  );
}

/** Resumen de la ronda (ingresos, reparaciones, clima...). */
export function Report({ report }: { report: NonNullable<UIState['report']> }) {
  return (
    <div class="px report" role="status">
      <span class="label">{report.title}</span>
      {report.lines.map((l) => (
        <div class={`line ${l.tone}`}>
          {l.weather ? <WeatherIcon id={l.weather} cls="px-icon wx-icon" /> : <Icon k={l.icon} />}
          <span>{l.text}</span>
        </div>
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
