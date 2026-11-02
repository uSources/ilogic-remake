import { t } from '../../settings';
import { Button } from '../common/buttons';
import { ui } from '../store';
import type { LabVM } from '../vm/lab';

/** Laboratorio de animaciones: elegir unidades y reproducir cada accion (src/lab.ts). */
export function LabPanel({ l, busy }: { l: LabVM; busy: boolean }) {
  const a = ui.actions;
  const pick = (k: 'attacker' | 'defender', v: number) => (
    <select class="lab-select" value={v} disabled={busy} onChange={(e) => a.labSet({ [k]: Number(e.currentTarget.value) })}>
      {l.units.map((n, i) => (
        <option key={i} value={i}>
          {n}
        </option>
      ))}
    </select>
  );
  const play = (k: 'move' | 'attack' | 'counter' | 'kill', label: string, needsAttack = true) => (
    <Button class="px-btn" disabled={busy || (needsAttack && !l.canAttack)} onClick={() => a.labPlay(k)}>
      {label}
    </Button>
  );
  return (
    <div class="px lab-panel" role="toolbar" aria-label={t('labTitle')}>
      <span class="label">{t('labTitle')}</span>
      <div class="lab-row">
        <span class="muted">{t('youShort')}</span>
        {pick('attacker', l.attacker)}
        <span class="muted">{t('enemy')}</span>
        {pick('defender', l.defender)}
        <label class="lab-slow">
          <input type="checkbox" checked={l.slow} disabled={busy} onChange={(e) => a.labSet({ slow: e.currentTarget.checked })} />{' '}
          {t('labSlow')}
        </label>
      </div>
      <div class="lab-row">
        {play('move', t('labMove'), false)}
        {play('attack', t('labAttack'))}
        {play('counter', t('labCounter'))}
        {play('kill', t('labKill'))}
        <Button class="px-btn plain" onClick={() => a.labExit()}>
          {t('back')}
        </Button>
      </div>
    </div>
  );
}
