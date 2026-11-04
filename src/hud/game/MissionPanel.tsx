import type { UIState } from '../state';

/** Panel de la mision en curso: objetivo, como va y el consejo del paso del tutorial. */
export function MissionPanel({ mission }: { mission: NonNullable<UIState['mission']> }) {
  return (
    <div class="px missionpanel" role="status">
      <span class="label">{mission.title}</span>
      <span class="mp-obj">{mission.objective}</span>
      {mission.status && <span class="mp-status">{mission.status}</span>}
      {mission.tip && (
        <div class="mp-tip">
          {mission.step && <span class="key">{mission.step}</span>} {mission.tip}
        </div>
      )}
    </div>
  );
}
