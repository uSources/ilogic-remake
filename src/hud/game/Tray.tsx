import { t } from '../../settings';
import { Button } from '../common/buttons';
import { FoldMark, useFold } from '../common/fold';
import { Icon } from '../common/Icon';
import { ui } from '../store';
import type { IdleVM, SquadVM } from '../vm/army';

/** Retratos de unidades sin mover que caben en la bandeja (el resto, "+n"). */
const TRAY_MAX = 8;

/** Bandeja de la derecha: unidades sin mover, escuadras y los botones de elegir varias, amenaza y ordenes. */
export function Tray({
  idle,
  threat,
  intents,
  anyCommand,
  squads,
  multi,
}: {
  idle: IdleVM[];
  threat: boolean;
  intents: boolean;
  anyCommand: boolean;
  squads: SquadVM[];
  multi: number | null;
}) {
  const a = ui.actions;
  const [folded, toggleFold] = useFold('tray');
  return (
    <div class={`px tray ${folded ? 'folded' : ''}`}>
      <div class="label tray-head" onClick={toggleFold} aria-expanded={!folded}>
        <span>
          <FoldMark folded={folded} />
          {t('idle')} · {idle.length}
        </span>
        {idle.length > 0 && (
          <span class="key-hint" style={{ color: 'var(--gold)' }}>
            TAB
          </span>
        )}
      </div>
      {idle.length > 0 ? (
        <div class="slots">
          {idle.slice(0, TRAY_MAX).map((u) => (
            <Button key={u.uid} title={u.name} aria-label={u.name} onClick={() => a.focusUnit(u.uid)}>
              <Icon k={u.icon} alt={u.name} />
            </Button>
          ))}
          {idle.length > TRAY_MAX && <span class="more">+{idle.length - TRAY_MAX}</span>}
        </div>
      ) : (
        <span class="all">{t('allMoved')}</span>
      )}
      {!folded && squads.length === 0 && <div class="squads-none">{t('squadsNone')}</div>}
      {!folded && squads.length > 0 && (
        <div class="squads" aria-label={t('squads')}>
          {squads.map((q) => (
            <Button
              key={q.id}
              class="squad"
              title={`${q.order ? (q.formation ? `${q.order} · ${t('squadFormation')}` : q.order) : q.name}${q.key ? ` · ${t('squadKeyHint')} ${q.key}` : ''}`}
              onClick={() => a.selectSquad(q.id)}
            >
              {q.key && <span class="key">{q.key}</span>}
              <span class="sq-name">{q.name}</span>
              <span class="sq-count num">×{q.count}</span>
              {q.order && <span class="sq-order">{q.order}</span>}
              {q.detached > 0 && (
                <span class="sq-detached num" title={t('detachedHint')}>
                  {q.detached} {t(q.detached === 1 ? 'detachedOne' : 'detachedMany')}
                </span>
              )}
            </Button>
          ))}
        </div>
      )}
      <Button class={`px-btn plain multi ${multi !== null ? 'on' : ''}`} onClick={() => a.multiSelect()} aria-pressed={multi !== null}>
        {multi === null ? t('multiOff') : multi > 0 ? `${t('multiOrders')} (${multi})` : t('multiOn')}
      </Button>
      <ToggleButton
        cls="threat"
        on={threat}
        k="T"
        long={threat ? t('threatOn') : t('threatOff')}
        short={t('threatShort')}
        onClick={() => a.toggleThreat()}
      />
      {anyCommand && (
        <ToggleButton
          cls="threat intents"
          on={intents}
          k="V"
          long={intents ? t('intentsOn') : t('intentsOff')}
          short={t('intentsShort')}
          onClick={() => a.toggleIntents()}
        />
      )}
    </div>
  );
}

/** Interruptor de la bandeja con su tecla y el texto largo o corto (segun el ancho, ver styles/). */
function ToggleButton(p: { cls: string; on: boolean; k: string; long: string; short: string; onClick: () => void }) {
  return (
    <Button class={`px-btn plain ${p.cls} ${p.on ? 'on' : ''}`} onClick={p.onClick} aria-pressed={p.on}>
      <span class="key">{p.k}</span>
      <span class="long">{p.long}</span>
      <span class="short">{p.short}</span>
    </Button>
  );
}
