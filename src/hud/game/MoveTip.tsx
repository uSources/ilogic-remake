import { t } from '../../settings';
import { stars } from '../common/format';
import { scaled, zoom } from '../common/Popover';
import type { MoveTipVM } from '../vm/army';

/** Separacion de la etiqueta a la derecha de la casilla y por encima de ella, en px. */
const GAP_RIGHT = 6;
const RAISE = 30;
/** Ancho que se le reserva para que no se salga por la derecha de la pantalla. */
const MAX_WIDTH = 200;
/** Que no se meta debajo de la barra de arriba. */
const BELOW_TOP_BAR = 76;

/** Etiqueta pequeña encima de la casilla al mover: no tapa el mapa ni recibe clics. */
export function MoveTip({ moveTip }: { moveTip: MoveTipVM }) {
  const tile = scaled(moveTip.anchor);
  const left = Math.round(tile.x + tile.w + GAP_RIGHT);
  const top = Math.round(tile.y - RAISE);
  const screenWidth = window.innerWidth / zoom();
  return (
    <div
      class={`px movetip ${moveTip.invalid ? 'bad' : ''}`}
      style={{ left: Math.min(left, screenWidth - MAX_WIDTH), top: Math.max(BELOW_TOP_BAR, top) }}
    >
      <span class="mt-act">{moveTip.action}</span>
      {moveTip.used !== undefined && (
        <span class="num">
          {moveTip.used}/{moveTip.max}
        </span>
      )}
      {moveTip.stars !== undefined && moveTip.stars > 0 && <span class="gold">{stars(moveTip.stars)}</span>}
      {moveTip.danger && (
        <span class="mt-danger" title={t('tipDanger')}>
          ⚠
        </span>
      )}
    </div>
  );
}
