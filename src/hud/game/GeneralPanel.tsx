import { imgUrl } from '../../assets';
import { t } from '../../settings';
import { Button } from '../common/buttons';
import { stars } from '../common/format';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { GeneralAbilityVM, GeneralVM } from '../vm/general';

/** Retrato del general (o su inicial si no hay dibujo). */
function GeneralFace({ general, cls = 'gp-face' }: { general: GeneralVM; cls?: string }) {
  const src = imgUrl(general.face);
  return (
    <span class={`${cls}${src ? ' has-img' : ''}`} aria-hidden="true">
      {src ? <img class="px-icon" src={src} alt="" draggable={false} /> : general.name[0]}
    </span>
  );
}

/** Barra de carga en estrellas: llenas, la que se esta cargando (con `--fill`) y vacias. */
function ChargeBar({ general, title }: { general: GeneralVM; title?: string }) {
  const charging = general.stars;
  const starClass = (i: number) => (i < charging ? 'full' : i === charging ? 'part' : '');
  return (
    <div class="gp-charge" title={title}>
      {Array.from({ length: general.max }, (_, i) => (
        <i class={starClass(i)} style={i === charging ? { '--fill': `${Math.round(general.fraction * 100)}%` } : undefined} />
      ))}
    </div>
  );
}

/** Apuntando con esta habilidad: el boton pasa a ser "Cancelar". */
function CancelAbilityButton() {
  return (
    <Button class="px-btn plain gp-ab on" onClick={() => ui.actions.cancelAbility()}>
      {t('genCancel')} <span class="key">Esc</span>
    </Button>
  );
}

/** Una habilidad: apagada si no se puede usar ahora (y al pasar por encima, por que). */
function AbilityButton({ ability, mine }: { ability: GeneralAbilityVM; mine: boolean }) {
  const isUsable = ability.ready && mine;
  const why = ability.reason ? ` · ${ability.reason}` : '';
  return (
    <Button
      class={`px-btn gp-ab ${isUsable ? '' : 'off'}`}
      disabled={!mine}
      title={`${ability.description}${why}`}
      onClick={() => ui.actions.useAbility(ability.id)}
    >
      <span class="gp-ab-name">
        {imgUrl(ability.icon) && <Icon k={ability.icon} cls="px-icon gp-ab-icon" />}
        {ability.name}
      </span>
      <span class="gp-cost">{stars(ability.cost)}</span>
    </Button>
  );
}

/** Panel del general: barra de carga en estrellas y un boton por habilidad. */
export function GeneralPanel({ general, mine }: { general: GeneralVM; mine: boolean }) {
  return (
    <div class="px general-panel" aria-label={`${t('general')}: ${general.name}`}>
      <div class="gp-head">
        <GeneralFace general={general} />
        <div>
          <div class="gp-name">{general.name}</div>
          <div class="gp-title">{general.title}</div>
        </div>
      </div>
      <ChargeBar general={general} title={t('genChargeHint')} />
      <div class="gp-abilities">
        {general.abilities.map((ability) =>
          general.targeting === ability.id ? (
            <CancelAbilityButton key={ability.id} />
          ) : (
            <AbilityButton key={ability.id} ability={ability} mine={mine} />
          ),
        )}
      </div>
    </div>
  );
}

/** Al pasar por encima del general enemigo: su descripcion y cada habilidad con su coste. */
function enemyGeneralTip(general: GeneralVM): string {
  const abilities = general.abilities.map((ability) => `${ability.name} (${stars(ability.cost)}): ${ability.description}`);
  return `${general.description}\n${abilities.join('\n')}`;
}

/** General de la IA: solo su nombre y su barra (para saber cuando puede usar sus habilidades). */
export function EnemyGeneral({ general }: { general: GeneralVM }) {
  return (
    <div class="px enemy-general" title={enemyGeneralTip(general)}>
      <div class="gp-head">
        <GeneralFace general={general} cls="gp-face eg-face" />
        <div>
          <span class="eg-label">{t('enemy')}</span>
          <span class="gp-name">{general.name}</span>
        </div>
      </div>
      <ChargeBar general={general} />
    </div>
  );
}
