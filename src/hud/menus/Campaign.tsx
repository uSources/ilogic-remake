import { t } from '../../settings';
import { Btn, Button } from '../common/buttons';
import type { UIState } from '../state';
import { ui } from '../store';
import type { CampaignItemVM } from '../vm/menus';

type CampaignVM = UIState['campaign'];

/** Pie de la tarjeta: "✓ 12 días" si esta hecha (con su mejor marca), o que esta cerrada. */
function cardStateText(mission: CampaignItemVM): string {
  if (mission.status === 'done') return `✓${mission.best ? ` ${mission.best} ${t('days')}` : ''}`;
  return mission.status === 'locked' ? t('locked') : '';
}

function MissionCard({ mission, index, isSelected }: { mission: CampaignItemVM; index: number; isSelected: boolean }) {
  return (
    <Button
      role="option"
      aria-selected={isSelected}
      class={`cp-card ${mission.status} ${isSelected ? 'sel' : ''}`}
      onMouseEnter={() => ui.actions.campaignHover(index)}
      onClick={() => ui.actions.campaignPick(index)}
      scrollTo={isSelected}
    >
      <span class="cp-num">{index + 1}</span>
      <img src={mission.thumb} alt="" />
      <span class="cp-kind">{mission.kind}</span>
      <span class="cp-title">{mission.title}</span>
      <span class="cp-state">{cardStateText(mission)}</span>
    </Button>
  );
}

/** Explicacion de la mision elegida, su objetivo, su mejor marca y "Jugar" (si esta abierta). */
function MissionBrief({ campaign, mission }: { campaign: CampaignVM; mission: CampaignItemVM }) {
  return (
    <div class="cp-brief2">
      <div class="cp-text">
        <span class="label">
          {campaign.selected + 1}. {mission.title}
        </span>
        <p>{campaign.brief}</p>
        <p class="cp-obj">{campaign.objective}</p>
        {mission.best !== null && (
          <p class="muted">
            {t('bestDays')}: {mission.best} {t('days')}
          </p>
        )}
      </div>
      {mission.status === 'locked' ? (
        <p class="muted">{t('locked')}</p>
      ) : (
        <Btn onPick={() => ui.actions.campaignPick(campaign.selected)}>
          {t('play')} <span class="key">Enter</span>
        </Btn>
      )}
    </div>
  );
}

/** Campaña: una tarjeta por mision y, debajo, la explicacion de la elegida. */
export function Campaign({ s }: { s: UIState }) {
  const campaign = s.campaign;
  const selectedMission = campaign.items[campaign.selected];
  return (
    <div class="px campaign2" role="dialog" aria-label={t('campaign')}>
      <span class="htitle">{t('campaign')}</span>
      <div class="cp-cards" role="listbox">
        {campaign.items.map((mission, index) => (
          <MissionCard key={mission.id} mission={mission} index={index} isSelected={index === campaign.selected} />
        ))}
      </div>
      {selectedMission && <MissionBrief campaign={campaign} mission={selectedMission} />}
      <Btn cls="px-btn plain cp-back" onPick={() => ui.actions.campaignBack()}>
        {t('back')} <span class="key">Esc</span>
      </Btn>
    </div>
  );
}
