import { t } from '../../settings';
import { Button } from '../common/buttons';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { SelectionVM } from '../vm/army';

/** Retratos que caben en el panel de lo elegido (el resto, "+n"). */
const PICKED_MAX = 24;

/**
 * [CAMBIO] Panel de lo elegido, como en los juegos de estrategia en tiempo real: un retrato por
 * unidad (por tipo) con su vida. Clic: solo esa; Mayusculas: quitarla; Ctrl: solo las de su tipo.
 * Tab va pasando por ellas.
 */
export function SelectionPanel({ sel }: { sel: SelectionVM }) {
  const a = ui.actions;
  return (
    <div class="px picked" aria-label={t('pickedTitle')}>
      <div class="label picked-head">
        <span>
          {t('pickedTitle')} · {sel.units.length}
        </span>
        <span class="key-hint" style={{ color: 'var(--gold)' }}>
          TAB
        </span>
      </div>
      <div class="picked-types">{sel.types.map((ty) => `${ty.count} ${ty.name}`).join(' · ')}</div>
      <div class="picked-grid">
        {sel.units.slice(0, PICKED_MAX).map((u) => (
          <Button
            key={u.uid}
            class={u.current ? 'on' : ''}
            title={`${u.name} · ${u.life}`}
            aria-label={`${u.name} ${u.life}`}
            onClick={(e) => a.pickInSelection(u.uid, e.shiftKey, e.ctrlKey || e.metaKey)}
          >
            <Icon k={u.icon} alt={u.name} />
            <i class="life" style={{ width: `${Math.max(4, u.life)}%` }} />
          </Button>
        ))}
        {sel.units.length > PICKED_MAX && <span class="more">+{sel.units.length - PICKED_MAX}</span>}
      </div>
      <div class="picked-hint">{t('pickedHint')}</div>
    </div>
  );
}
