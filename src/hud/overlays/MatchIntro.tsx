import { imgUrl } from '../../assets';
import { t } from '../../settings';
import type { MatchIntroVM } from '../vm/notices';

/** Los dos de cada bando, como en la tarjeta de «Nueva partida»: un soldado y un tanque. */
function Army({ side }: { side: 'b' | 'r' }) {
  return (
    <div class={`intro-army ${side === 'r' ? 'mirrored' : ''}`}>
      <img class="px-icon soldier" src={imgUrl(`${side}_Soldier`)} alt="" />
      <img class="px-icon tank" src={imgUrl(`${side}_Tank`)} alt="" />
    </div>
  );
}

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
          <Army side="b" />
          <span class="intro-name">{t('onlineYou')}</span>
          <span class={`intro-tag ${intro.youStart ? 'starts' : 'blue'}`}>
            {intro.youStart ? t('onlineYouStart') : t('onlineArmyBlue')}
          </span>
        </div>
        <span class="intro-vs" aria-hidden="true">
          VS
        </span>
        <div class="px intro-card red">
          <Army side="r" />
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
