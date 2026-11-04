import { t } from '../../settings';
import { pct, stars } from '../common/format';
import { Icon } from '../common/Icon';
import type { CombatSideVM, CombatVM } from '../vm/combat';

/** "Ataca", "Defiende" o, si el defensor responde, "Contraataca". */
function roleText(side: CombatSideVM, hasCounter: boolean): string {
  if (side.role === 'attacker') return t('combatAttacks');
  return hasCounter ? t('combatCounter') : t('combatDefends');
}

/** "-30" con el daño recibido, "FALLO" si fallaron, nada si aun no le han disparado. */
function hurtText(hurt: number | null): string {
  if (hurt === null) return '';
  return hurt > 0 ? `-${hurt}` : t('fxMiss');
}

function LifeBar({ side }: { side: CombatSideVM }) {
  return (
    <div class="cs-life" title={t('hp')}>
      <div class="cs-bar" aria-hidden="true">
        <span class="trail" style={{ width: `${side.life}%` }} />
        <span class="fill" style={{ width: `${side.life}%` }} />
      </div>
      <span class="cs-v num">{side.life}</span>
      {/* Hueco fijo para el daño: que la barra no cambie de ancho cuando aparece. */}
      <span key={side.hurt ?? 'none'} class={`cs-hurt${side.hurt === 0 ? ' miss' : ''}`}>
        {hurtText(side.hurt)}
      </span>
    </div>
  );
}

/** Un lado del panel de combate: retrato, papel en el combate, vida que baja y acierto. */
function CombatSide({ side, hasCounter, align }: { side: CombatSideVM; hasCounter: boolean; align: 'left' | 'right' }) {
  const tone = side.team === 0 ? 'blue' : 'red';
  return (
    <div class={`px combat-side ${tone} ${align}${side.ko ? ' ko' : ''}`}>
      <div class="cs-head">
        <span class="cs-portrait">
          <Icon k={side.icon} alt={side.name} cls="px-icon" />
          {side.ko && <span class="cs-ko">{t('combatKO')}</span>}
        </span>
        <div class="cs-info">
          <span class="cs-name">
            {side.name}
            {side.rank ? <span class="rank">{' ' + stars(side.rank)}</span> : null}
          </span>
          <span class={`cs-role ${side.role}`}>{roleText(side, hasCounter)}</span>
          {side.hit !== null && (
            <span class="muted cs-hit">
              {t('combatHit')} {pct(side.hit)}
            </span>
          )}
        </div>
      </div>
      <LifeBar side={side} />
    </div>
  );
}

/** Panel de combate: abajo en el centro mientras se anima un ataque (ver CombatVM). */
export function CombatPanel({ combat }: { combat: CombatVM }) {
  return (
    <div key={combat.id} class={`combat stage-${combat.stage}`} role="status" aria-live="polite" aria-label={t('combat')}>
      <CombatSide side={combat.left} hasCounter={combat.counter} align="left" />
      <span class="combat-vs">VS</span>
      <CombatSide side={combat.right} hasCounter={combat.counter} align="right" />
    </div>
  );
}
