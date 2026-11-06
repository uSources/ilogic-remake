import { t } from '../../settings';
import { Btn } from '../common/buttons';
import type { HandoffVM } from '../vm/notices';
import { ui } from '../store';

/**
 * Cambio de persona en la misma pantalla: tapa la partida entera (la siguiente no ve lo de la
 * anterior) hasta que pulsa el boton (o Enter).
 */
export function Handoff({ handoff }: { handoff: HandoffVM }) {
  return (
    <div class="handoff-veil">
      <div class="px handoff" role="dialog" aria-label={t('handoffTitle')}>
        <span class="htitle">{t('handoffTitle')}</span>
        <p class="handoff-team">
          {t('handoffTeam')} {handoff.team}
        </p>
        <p class="handoff-hint">{t('handoffHint')}</p>
        <Btn sel cls="px-btn start" onPick={() => ui.actions.handoffReady()}>
          {t('handoffReady')}
        </Btn>
      </div>
    </div>
  );
}
