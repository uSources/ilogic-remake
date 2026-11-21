import { t } from '../../settings';
import { WeatherIcon } from '../common/WeatherIcon';
import type { UIState } from '../state';

/** Avisos que salen solos y se van (sus animaciones, en styles/): carga, aviso corto y cartel. */

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

/**
 * El cartel del dia, de tu turno o del final: una banderola de tela de juguete en el color del bando
 * que cae colgada de su barra, se balancea y se va (docs/PLAN-INTERFAZ-2.md, fase 6). Lleva lo grande
 * («Día 4»), lo pequeño («Tu turno») y, si el clima ha cambiado, su icono grande.
 */
export function Banner({ banner }: { banner: NonNullable<UIState['banner']> }) {
  return (
    <div class={`banner ${banner.tone === 'red' ? 'red' : ''}`} aria-live="polite">
      <span class="banner-rod" />
      <div class="banner-cloth">
        <span class="b">{banner.big}</span>
        {banner.weather && <WeatherIcon id={banner.weather} cls="px-icon banner-weather" />}
        <span class="s">{banner.small}</span>
      </div>
    </div>
  );
}
