import { imgUrl } from '../../assets';
import { t } from '../../settings';
import { Button } from '../common/buttons';
import { stars } from '../common/format';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { GeneralVM } from '../vm/general';

/** Retrato del general (o su inicial si no hay dibujo). */
function GeneralFace({ g, cls = 'gp-face' }: { g: GeneralVM; cls?: string }) {
  const src = imgUrl(g.face);
  return (
    <span class={`${cls}${src ? ' has-img' : ''}`} aria-hidden="true">
      {src ? <img class="px-icon" src={src} alt="" draggable={false} /> : g.name[0]}
    </span>
  );
}

/** Barra de carga en estrellas: llenas, la que se esta cargando (con `--fill`) y vacias. */
function ChargeBar({ g, title }: { g: GeneralVM; title?: string }) {
  return (
    <div class="gp-charge" title={title}>
      {Array.from({ length: g.max }, (_, i) => (
        <i
          class={i < g.stars ? 'full' : i === g.stars ? 'part' : ''}
          style={i === g.stars ? { '--fill': `${Math.round(g.fraction * 100)}%` } : undefined}
        />
      ))}
    </div>
  );
}

/** Panel del general: barra de carga en estrellas y un boton por habilidad. */
export function GeneralPanel({ g, mine }: { g: GeneralVM; mine: boolean }) {
  const a = ui.actions;
  return (
    <div class="px general-panel" aria-label={`${t('general')}: ${g.name}`}>
      <div class="gp-head">
        <GeneralFace g={g} />
        <div>
          <div class="gp-name">{g.name}</div>
          <div class="gp-title">{g.title}</div>
        </div>
      </div>
      <ChargeBar g={g} title={t('genChargeHint')} />
      <div class="gp-abilities">
        {g.abilities.map((ab) =>
          g.targeting === ab.id ? (
            <Button key={ab.id} class="px-btn plain gp-ab on" onClick={() => a.cancelAbility()}>
              {t('genCancel')} <span class="key">Esc</span>
            </Button>
          ) : (
            <Button
              key={ab.id}
              class={`px-btn gp-ab ${ab.ready && mine ? '' : 'off'}`}
              disabled={!mine}
              title={`${ab.description}${ab.reason ? ` · ${ab.reason}` : ''}`}
              onClick={() => a.useAbility(ab.id)}
            >
              <span class="gp-ab-name">
                {imgUrl(ab.icon) && <Icon k={ab.icon} cls="px-icon gp-ab-icon" />}
                {ab.name}
              </span>
              <span class="gp-cost">{stars(ab.cost)}</span>
            </Button>
          ),
        )}
      </div>
    </div>
  );
}

/** General de la IA: solo su nombre y su barra (para saber cuando puede usar sus habilidades). */
export function EnemyGeneral({ g }: { g: GeneralVM }) {
  return (
    <div
      class="px enemy-general"
      title={`${g.description}\n${g.abilities.map((a) => `${a.name} (${stars(a.cost)}): ${a.description}`).join('\n')}`}
    >
      <div class="gp-head">
        <GeneralFace g={g} cls="gp-face eg-face" />
        <div>
          <span class="eg-label">{t('enemy')}</span>
          <span class="gp-name">{g.name}</span>
        </div>
      </div>
      <ChargeBar g={g} />
    </div>
  );
}
