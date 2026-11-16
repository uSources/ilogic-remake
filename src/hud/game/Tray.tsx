import { t } from '../../settings';
import { Button } from '../common/buttons';
import { FoldMark, useFold } from '../common/fold';
import { Icon } from '../common/Icon';
import { Chip } from '../common/toy';
import { keyLabelOf } from '../keyLabels';
import { ui } from '../store';
import type { IdleVM, SquadVM } from '../vm/army';

/** Retratos de unidades sin mover que caben en la bandeja (el resto, "+n"). */
const TRAY_MAX = 8;

/** Unidades sin mover: un retrato por unidad (clic: ir a ella), o "Todas movidas". */
function IdleSlots({ idle }: { idle: IdleVM[] }) {
  if (idle.length === 0) return <span class="all">{t('allMoved')}</span>;
  return (
    <div class="slots">
      {idle.slice(0, TRAY_MAX).map((unit) => (
        <Button key={unit.uid} title={unit.name} aria-label={unit.name} onClick={() => ui.actions.focusUnit(unit.uid)}>
          <Icon k={unit.icon} alt={unit.name} />
        </Button>
      ))}
      {idle.length > TRAY_MAX && <span class="more">+{idle.length - TRAY_MAX}</span>}
    </div>
  );
}

/** Al pasar por encima: la orden (y si van en formacion) o el nombre, y su tecla. */
function squadTitle(squad: SquadVM): string {
  const order = squad.formation ? `${squad.order} · ${t('squadFormation')}` : squad.order;
  const what = squad.order ? order : squad.name;
  const key = squad.key ? ` · ${t('squadKeyHint')} ${squad.key}` : '';
  return `${what}${key}`;
}

function SquadButton({ squad }: { squad: SquadVM }) {
  return (
    <Button class="squad" title={squadTitle(squad)} onClick={() => ui.actions.selectSquad(squad.id)}>
      {squad.key && <span class="key">{squad.key}</span>}
      <span class="sq-name">{squad.name}</span>
      <span class="sq-count num">×{squad.count}</span>
      {squad.order && <span class="sq-order">{squad.order}</span>}
      {squad.detached > 0 && (
        <span class="sq-detached num" title={t('detachedHint')}>
          {squad.detached} {t(squad.detached === 1 ? 'detachedOne' : 'detachedMany')}
        </span>
      )}
    </Button>
  );
}

/** Escuadras (sin ninguna, nada: como se hace una lo cuenta la ayuda). */
function Squads({ squads }: { squads: SquadVM[] }) {
  if (squads.length === 0) return null;
  return (
    <div class="squads" aria-label={t('squads')}>
      {squads.map((squad) => (
        <SquadButton key={squad.id} squad={squad} />
      ))}
    </div>
  );
}

/** "Elegir varias" apagado; encendido, "Toca tus unidades…" o "Órdenes (n)" con las elegidas. */
function multiSelectLabel(picked: number | null): string {
  if (picked === null) return t('multiOff');
  return picked > 0 ? `${t('multiOrders')} (${picked})` : t('multiOn');
}

/** Bandeja de la derecha: unidades sin mover, escuadras, «Elegir varias» (con el dedo) y los iconos de amenaza y ordenes. */
export function Tray({
  idle,
  threat,
  intents,
  anyStandingOrder,
  squads,
  multi,
}: {
  idle: IdleVM[];
  threat: boolean;
  intents: boolean;
  anyStandingOrder: boolean;
  squads: SquadVM[];
  multi: number | null;
}) {
  const actions = ui.actions;
  const [folded, toggleFold] = useFold('tray');
  const isMultiSelecting = multi !== null;
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
      <IdleSlots idle={idle} />
      {!folded && <Squads squads={squads} />}
      <Button
        class={`px-btn plain multi ${isMultiSelecting ? 'on' : ''}`}
        onClick={() => actions.multiSelect()}
        aria-pressed={isMultiSelecting}
      >
        {multiSelectLabel(multi)}
      </Button>
      <div class="tray-toggles">
        <Toggle
          icon="ui/zona_r"
          on={threat}
          label={`${threat ? t('threatOn') : t('threatOff')} (${keyLabelOf('threat')})`}
          onClick={() => actions.toggleThreat()}
        />
        {anyStandingOrder && (
          <Toggle
            icon="ui/flag_cmd_go"
            on={intents}
            label={`${intents ? t('intentsOn') : t('intentsOff')} (${keyLabelOf('intents')})`}
            onClick={() => actions.toggleIntents()}
          />
        )}
      </div>
    </div>
  );
}

/** Interruptor de la bandeja: un icono (azul si esta encendido) y su nombre y tecla al pasar el raton. */
function Toggle(props: { icon: string; on: boolean; label: string; onClick: () => void }) {
  return <Chip label={props.label} icon={props.icon} tone={props.on ? 'own' : 'plain'} cls="tray-toggle" onClick={props.onClick} />;
}
