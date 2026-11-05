import { t } from '../../settings';
import { Button } from '../common/buttons';
import { ui } from '../store';
import type { LabVM } from '../vm/lab';

type Side = 'attacker' | 'defender';
type LabAnimation = 'move' | 'attack' | 'counter' | 'kill';

/** Desplegable con todas las unidades para un lado del combate. */
function UnitSelect({ lab, side, busy }: { lab: LabVM; side: Side; busy: boolean }) {
  return (
    <select
      class="lab-select"
      value={lab[side]}
      disabled={busy}
      onChange={(event) => ui.actions.labSet({ [side]: event.currentTarget.value })}
    >
      {lab.units.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.name}
        </option>
      ))}
    </select>
  );
}

/** Boton que reproduce una animacion; las de combate necesitan que el atacante pueda atacar. */
function PlayButton({ lab, busy, animation, label }: { lab: LabVM; busy: boolean; animation: LabAnimation; label: string }) {
  const needsAttack = animation !== 'move';
  return (
    <Button class="px-btn" disabled={busy || (needsAttack && !lab.canAttack)} onClick={() => ui.actions.labPlay(animation)}>
      {label}
    </Button>
  );
}

/** Laboratorio de animaciones: elegir unidades y reproducir cada accion (src/lab.ts). */
export function LabPanel({ lab, busy }: { lab: LabVM; busy: boolean }) {
  return (
    <div class="px lab-panel" role="toolbar" aria-label={t('labTitle')}>
      <span class="label">{t('labTitle')}</span>
      <div class="lab-row">
        <span class="muted">{t('youShort')}</span>
        <UnitSelect lab={lab} side="attacker" busy={busy} />
        <span class="muted">{t('enemy')}</span>
        <UnitSelect lab={lab} side="defender" busy={busy} />
        <label class="lab-slow">
          <input
            type="checkbox"
            checked={lab.slow}
            disabled={busy}
            onChange={(event) => ui.actions.labSet({ slow: event.currentTarget.checked })}
          />{' '}
          {t('labSlow')}
        </label>
      </div>
      <div class="lab-row">
        <PlayButton lab={lab} busy={busy} animation="move" label={t('labMove')} />
        <PlayButton lab={lab} busy={busy} animation="attack" label={t('labAttack')} />
        <PlayButton lab={lab} busy={busy} animation="counter" label={t('labCounter')} />
        <PlayButton lab={lab} busy={busy} animation="kill" label={t('labKill')} />
        <Button class="px-btn plain" onClick={() => ui.actions.labExit()}>
          {t('back')}
        </Button>
      </div>
    </div>
  );
}
