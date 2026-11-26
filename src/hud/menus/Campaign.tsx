import { t } from '../../settings';
import { Btn } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import type { CampaignItemVM } from '../vm/menus';
import { MenuScreen } from './MenuScreen';
import { TextEntry } from './TextEntry';

type CampaignVM = UIState['campaign'];

/** Rectangulos `[x, y, ancho, alto]` de un candado de pixeles (7 x 8): el arco y el cuerpo con su cerradura. */
const PADLOCK = [
  [2, 0, 3, 1],
  [1, 1, 1, 2],
  [5, 1, 1, 2],
  [0, 3, 7, 2],
  [0, 5, 3, 2],
  [4, 5, 3, 2],
  [0, 7, 7, 1],
] as const;

function Padlock() {
  return (
    <svg class="cp-lock" viewBox="0 0 7 8" aria-hidden="true" shape-rendering="crispEdges">
      {PADLOCK.map(([x, y, width, height]) => (
        <rect x={x} y={y} width={width} height={height} fill="currentColor" />
      ))}
    </svg>
  );
}

/** El punto de la mision en el camino: ✓ si esta hecha, su numero si esta abierta, un candado si no. */
function MissionDot({ mission, number }: { mission: CampaignItemVM; number: number }) {
  const mark = { done: '✓', open: number, locked: <Padlock /> }[mission.status];
  return (
    <span class="cp-dot" aria-hidden="true">
      {mark}
    </span>
  );
}

/** Una mision del camino; las cerradas, apagadas (no se pueden elegir). */
function MissionStep({ campaign, mission, index }: { campaign: CampaignVM; mission: CampaignItemVM; index: number }) {
  const isSelected = index === campaign.selected;
  return (
    <li class={`cp-step ${mission.status} ${isSelected ? 'current' : ''}`}>
      <MissionDot mission={mission} number={index + 1} />
      <TextEntry
        sel={isSelected && !campaign.backSel}
        disabled={mission.status === 'locked'}
        title={mission.title}
        note={mission.note}
        onHover={() => ui.actions.campaignHover(index)}
        onPick={() => ui.actions.campaignPick(index)}
      />
    </li>
  );
}

/** La ficha de la mision elegida: su mapa, de que va, su objetivo, su mejor marca y «Jugar». */
function MissionCard({ campaign, mission }: { campaign: CampaignVM; mission: CampaignItemVM }) {
  return (
    <section class="menu-card campaign-card" aria-label={mission.title}>
      <span class="menu-card-kicker">
        {t('mission')} {campaign.selected + 1} · {mission.kind}
      </span>
      <h2 class="campaign-card-title">{mission.title}</h2>
      <img class="campaign-map" src={mission.thumb} alt="" />
      <p class="campaign-brief">{campaign.brief}</p>
      <p class="campaign-objective">{campaign.objective}</p>
      {mission.best !== null && (
        <p class="campaign-best">
          {t('bestDays')}: {mission.best} {t('days')}
        </p>
      )}
      <Btn cls="campaign-play" onPick={() => ui.actions.campaignPick(campaign.selected)}>
        {t('play')} <span class="campaign-play-arrow">▸</span> <span class="text-entry-key">Enter</span>
      </Btn>
    </section>
  );
}

/**
 * Campaña, en el menu clasico de texto: las misiones como un camino (las hechas en oro, la elegida con
 * su numero en un aro dorado y las cerradas con candado) y «Volver»; a la derecha, la ficha de la elegida.
 */
export function Campaign({ s }: { s: UIState }) {
  const campaign = s.campaign;
  const selectedMission = campaign.items[campaign.selected];
  const card = selectedMission && <MissionCard campaign={campaign} mission={selectedMission} />;
  return (
    <MenuScreen cls="campaign" kicker={campaign.progress} title={t('campaign')} hint={t('campaignHint')} card={card}>
      <nav class="text-list campaign-list" aria-label={t('campaign')}>
        <ol class="cp-route">
          {campaign.items.map((mission, index) => (
            <MissionStep key={mission.id} campaign={campaign} mission={mission} index={index} />
          ))}
        </ol>
        <TextEntry
          sel={campaign.backSel}
          cls="campaign-back"
          title={t('back')}
          keyHint="Esc"
          sound="ui_back"
          onHover={() => ui.actions.campaignBackHover()}
          onPick={() => ui.actions.campaignBack()}
        />
      </nav>
    </MenuScreen>
  );
}
