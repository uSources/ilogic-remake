import { t } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { PickedVM, SelectionVM } from '../vm/army';

/** Retratos que caben en el panel de lo elegido (el resto, "+n"). */
const PICKED_MAX = 24;
/** Ancho minimo de la barra de vida, en %, para que se vea aunque le quede muy poca. */
const MIN_LIFE_BAR = 4;

/** Retrato con su vida. Clic: solo esa; Mayusculas: quitarla; Ctrl (o Cmd): solo las de su tipo. */
function PickedUnit({ unit }: { unit: PickedVM }) {
  return (
    <Button
      class={unit.current ? 'on' : ''}
      title={`${unit.name} · ${unit.life}`}
      aria-label={`${unit.name} ${unit.life}`}
      onClick={(event) => ui.actions.pickInSelection(unit.uid, event.shiftKey, event.ctrlKey || event.metaKey)}
    >
      <Icon k={unit.icon} alt={unit.name} />
      <i class="life" style={{ width: `${Math.max(MIN_LIFE_BAR, unit.life)}%` }} />
    </Button>
  );
}

/**
 * [CAMBIO] Panel de lo elegido, como en los juegos de estrategia en tiempo real: un retrato por
 * unidad (por tipo) con su vida. Tab va pasando por ellas.
 */
export function SelectionPanel({ selection }: { selection: SelectionVM }) {
  const { units, types } = selection;
  return (
    <div class="px picked" aria-label={t('pickedTitle')}>
      <div class="label picked-head">
        <span>
          {t('pickedTitle')} · {units.length}
        </span>
        <span class="key-hint" style={{ color: 'var(--gold)' }}>
          TAB
        </span>
      </div>
      <div class="picked-types">{types.map((type) => `${type.count} ${type.name}`).join(' · ')}</div>
      <div class="picked-grid">
        {units.slice(0, PICKED_MAX).map((unit) => (
          <PickedUnit key={unit.uid} unit={unit} />
        ))}
        {units.length > PICKED_MAX && <span class="more">+{units.length - PICKED_MAX}</span>}
      </div>
      <div class="picked-hint">{t('pickedHint')}</div>
    </div>
  );
}
