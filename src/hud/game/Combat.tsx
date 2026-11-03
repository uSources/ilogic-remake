import { t } from '../../settings';
import { pct, stars } from '../common/format';
import { Icon } from '../common/Icon';
import type { CombatSideVM, CombatVM } from '../vm/combat';

/** Un lado del panel de combate: retrato, papel en el combate, vida que baja y acierto. */
function CombatSide({ c, counter, align }: { c: CombatSideVM; counter: boolean; align: 'left' | 'right' }) {
  const role = c.role === 'attacker' ? t('combatAttacks') : counter ? t('combatCounter') : t('combatDefends');
  const tone = c.team === 0 ? 'blue' : 'red';
  return (
    <div class={`px combat-side ${tone} ${align}${c.ko ? ' ko' : ''}`}>
      <div class="cs-head">
        <span class="cs-portrait">
          <Icon k={c.icon} alt={c.name} cls="px-icon" />
          {c.ko && <span class="cs-ko">{t('combatKO')}</span>}
        </span>
        <div class="cs-info">
          <span class="cs-name">
            {c.name}
            {c.rank ? <span class="rank">{' ' + stars(c.rank)}</span> : null}
          </span>
          <span class={`cs-role ${c.role}`}>{role}</span>
          {c.hit !== null && (
            <span class="muted cs-hit">
              {t('combatHit')} {pct(c.hit)}
            </span>
          )}
        </div>
      </div>
      <div class="cs-life" title={t('hp')}>
        <div class="cs-bar" aria-hidden="true">
          <span class="trail" style={{ width: `${c.life}%` }} />
          <span class="fill" style={{ width: `${c.life}%` }} />
        </div>
        <span class="cs-v num">{c.life}</span>
        {/* Hueco fijo para el daño: que la barra no cambie de ancho cuando aparece. */}
        <span key={c.hurt ?? 'none'} class={`cs-hurt${c.hurt === 0 ? ' miss' : ''}`}>
          {c.hurt === null ? '' : c.hurt > 0 ? `-${c.hurt}` : t('fxMiss')}
        </span>
      </div>
    </div>
  );
}

/** Panel de combate: abajo en el centro mientras se anima un ataque (ver CombatVM). */
export function CombatPanel({ c }: { c: CombatVM }) {
  return (
    <div key={c.id} class={`combat stage-${c.stage}`} role="status" aria-live="polite" aria-label={t('combat')}>
      <CombatSide c={c.left} counter={c.counter} align="left" />
      <span class="combat-vs">VS</span>
      <CombatSide c={c.right} counter={c.counter} align="right" />
    </div>
  );
}
