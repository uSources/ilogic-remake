import type { UIState } from '../state';

/** Panel de la mision en curso: objetivo, como va y el consejo del paso del tutorial. */
export function MissionPanel({ m }: { m: NonNullable<UIState['mission']> }) {
  return (
    <div class="px missionpanel" role="status">
      <span class="label">{m.title}</span>
      <span class="mp-obj">{m.objective}</span>
      {m.status && <span class="mp-status">{m.status}</span>}
      {m.tip && (
        <div class="mp-tip">
          {m.step && <span class="key">{m.step}</span>} {m.tip}
        </div>
      )}
    </div>
  );
}
