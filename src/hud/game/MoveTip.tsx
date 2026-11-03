import { t } from '../../settings';
import { stars } from '../common/format';
import { scaled, zoom } from '../common/Popover';
import type { MoveTipVM } from '../vm/army';

/** Etiqueta pequeña encima de la casilla al mover: no tapa el mapa ni recibe clics. */
export function MoveTip({ m }: { m: MoveTipVM }) {
  const a = scaled(m.anchor);
  const left = Math.round(a.x + a.w + 6);
  const top = Math.round(a.y - 30);
  return (
    <div
      class={`px movetip ${m.invalid ? 'bad' : ''}`}
      style={{ left: Math.min(left, window.innerWidth / zoom() - 200), top: Math.max(76, top) }}
    >
      <span class="mt-act">{m.action}</span>
      {m.used !== undefined && (
        <span class="num">
          {m.used}/{m.max}
        </span>
      )}
      {m.stars !== undefined && m.stars > 0 && <span class="gold">{stars(m.stars)}</span>}
      {m.danger && (
        <span class="mt-danger" title={t('tipDanger')}>
          ⚠
        </span>
      )}
    </div>
  );
}
