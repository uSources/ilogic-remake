import { t } from '../../settings';
import { Pill } from '../common/toy';
import type { TurnClockVM } from '../vm/topBar';

/** El anillo, en un lienzo de 44: el trazo va por el medio del aro (de 7 de grueso). */
const RING_SIZE = 44;
const RING_WIDTH = 7;
const RING_RADIUS = (RING_SIZE - RING_WIDTH) / 2;

/** Un anillo que se vacia: lleno lo que queda del turno (`left`, de 1 a 0), desde arriba y en el sentido del reloj. */
function ClockRing({ left }: { left: number }) {
  const center = RING_SIZE / 2;
  return (
    <svg class="tc-ring" viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
      <circle class="tc-track" cx={center} cy={center} r={RING_RADIUS} stroke-width={RING_WIDTH} />
      {/* pathLength 1: lo que falta del trazo es lo que se ha gastado del turno. */}
      <circle
        class="tc-fill"
        cx={center}
        cy={center}
        r={RING_RADIUS}
        stroke-width={RING_WIDTH}
        pathLength={1}
        stroke-dasharray="1 1"
        stroke-dashoffset={1 - left}
      />
    </svg>
  );
}

/**
 * El reloj del turno por la red, junto al dia: el anillo y lo que queda («1:26», «Día 4 · Te toca»).
 * Azul con tiempo de sobra, rojo los ultimos segundos y oscuro en el turno de otro (styles/game/turnclock.css).
 */
export function TurnClockPill({ clock }: { clock: TurnClockVM }) {
  return (
    <Pill cls={`turnclock ${clock.mood} side-${clock.side}`} role="timer" aria-label={`${t('onlineClockLabel')}: ${clock.time}`}>
      <ClockRing left={clock.left} />
      <span class="tc-text" aria-hidden="true">
        <b class="tc-time num">{clock.time}</b>
        <span class="tc-caption">{clock.caption}</span>
      </span>
    </Pill>
  );
}
