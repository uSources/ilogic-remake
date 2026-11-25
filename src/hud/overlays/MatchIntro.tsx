import { t } from '../../settings';
import { Army, Versus } from '../common/Army';
import type { MatchIntroVM } from '../vm/notices';

/**
 * «¡Rival encontrado!»: la carga de una partida que sale de «Buscar rival» (src/net/matchIntro.ts).
 * Los dos ejercitos frente a frente, quien empieza, lo que se juega y la barra de carga de siempre.
 */
export function MatchIntro({ intro, progress }: { intro: MatchIntroVM; progress: number }) {
  return (
    <div class="match-intro" role="status">
      <h1 class="intro-title">{t('onlineFound')}</h1>
      <div class="intro-sides">
        <div class="px intro-card blue">
          <Army paint="b" cls="intro-army" />
          <span class="intro-name">{t('onlineYou')}</span>
          <span class={`intro-tag ${intro.youStart ? 'starts' : 'blue'}`}>
            {intro.youStart ? t('onlineYouStart') : t('onlineArmyBlue')}
          </span>
        </div>
        <Versus cls="intro-vs" />
        <div class="px intro-card red">
          <Army paint="r" cls="intro-army" />
          <span class="intro-name">{t('onlineRival')}</span>
          <span class={`intro-tag ${intro.youStart ? 'red' : 'starts'}`}>
            {intro.youStart ? t('onlineArmyRed') : t('onlineRivalStarts')}
          </span>
        </div>
      </div>
      <ul class="intro-chips">
        {intro.chips.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </ul>
      <div class="intro-loading">
        <span class="label">{t('onlineFoundLoading')}</span>
        <div class="bar">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}
