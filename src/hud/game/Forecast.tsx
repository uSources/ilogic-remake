import { fmtNum, t } from '../../settings';
import { counterBadge, damageBadge, LIKELY_KILL, MENTION_DEATH, RISKY_COUNTER, type BadgeLook } from '../../ui/models/forecastBadges';
import { pct, range } from '../common/format';
import { Icon } from '../common/Icon';
import { useAltHeld } from '../common/useAltHeld';
import { Popover } from '../common/Popover';
import { Badge, PixelSkull } from '../common/toy';
import type { Anchor } from '../vm/common';
import type { ForecastVM } from '../vm/combat';

const FULL_LIFE = 100;
const LOST_LIFE_COLOR = '#6b1f1c';

/**
 * Barra de la vida enemiga en cuatro tramos: lo que seguro le queda, lo que puede perder, lo que
 * seguro pierde y el hueco de la vida que ya no tenia.
 */
function EnemyLifeBar({ forecast }: { forecast: ForecastVM }) {
  const { lifeBefore, low, high } = forecast;
  const surelyKept = Math.max(0, lifeBefore - high);
  const maybeLost = Math.max(0, Math.min(lifeBefore, high) - Math.min(lifeBefore, low));
  const surelyLost = Math.min(lifeBefore, low);
  const alreadyMissing = Math.max(0, FULL_LIFE - lifeBefore);
  return (
    <div class="lifebar" aria-hidden="true">
      {surelyKept > 0 && <span style={{ flex: surelyKept, background: 'var(--red)' }} />}
      {maybeLost > 0 && (
        <span style={{ flex: maybeLost, background: `repeating-linear-gradient(90deg, var(--red) 0 4px, ${LOST_LIFE_COLOR} 4px 8px)` }} />
      )}
      {surelyLost > 0 && <span style={{ flex: surelyLost, background: LOST_LIFE_COLOR }} />}
      {alreadyMissing > 0 && <span style={{ flex: alreadyMissing, background: 'var(--slot)' }} />}
    </div>
  );
}

/** Daño que te devuelve y como queda tu unidad, o "Contraataque: no hay". */
function CounterRows({ counter }: { counter: ForecastVM['counter'] }) {
  if (!counter)
    return (
      <div class="row muted">
        <span>{t('counter')}</span>
        <span>{t('none')}</span>
      </div>
    );
  const deathNote = counter.killChance >= MENTION_DEATH ? ` (${t('dies')} ${pct(counter.killChance)})` : '';
  return (
    <>
      <div class="row">
        <span>{t('counter')}</span>
        <span style={{ color: 'var(--red-soft)' }}>{range(counter.low, counter.high)}</span>
      </div>
      <div class="row">
        <span>{t('yourLife')}</span>
        <span style={{ color: counter.killChance >= RISKY_COUNTER ? 'var(--red-soft)' : 'var(--blue)' }}>
          {counter.lifeBefore} → {counter.lifeAfter}
          {deathNote}
        </span>
      </div>
    </>
  );
}

/** Fila "nombre  valor" con el valor en dorado (flanqueo, botin). */
function GoldRow({ label, value }: { label: string; value: string }) {
  return (
    <div class="row">
      <span>{label}</span>
      <span style={{ color: 'var(--gold)' }}>{value}</span>
    </div>
  );
}

/** Lo que sale ademas con Alt: la vida que le queda, flanqueo, botin y como queda tu unidad. */
function ForecastDetails({ forecast }: { forecast: ForecastVM }) {
  return (
    <>
      <div class="row">
        <span>{t('enemyLife')}</span>
        <span style={{ color: 'var(--gold)' }}>
          {forecast.lifeBefore} → {forecast.lifeAfter}
        </span>
      </div>
      {forecast.flank > 0 && <GoldRow label={t('flank')} value={`+${Math.round(forecast.flank * 100)} %`} />}
      {forecast.bounty > 0 && forecast.killChance > 0 && <GoldRow label={t('bounty')} value={`+${fmtNum(forecast.bounty)}`} />}
      <CounterRows counter={forecast.counter} />
    </>
  );
}

/** Una chapa de la prevision: el numero y, si puede caer, la calavera con su %. */
function ForecastBadge({ look, anchor, label, cls }: { look: BadgeLook; anchor: Anchor; label: string; cls?: string }) {
  return (
    <Badge anchor={anchor} tone={look.tone} label={label} cls={cls}>
      <span class="num">{look.text}</span>
      {look.death !== null && (
        <span class="badge-death">
          <PixelSkull />
          {pct(look.death)}
        </span>
      )}
    </Badge>
  );
}

/** La tarjeta con todo (con Alt): rango, vida antes y despues, cuanto puede destruirlo, flanqueo, botin y contraataque. */
function ForecastCard({ forecast }: { forecast: ForecastVM }) {
  return (
    <Popover anchor={forecast.anchor} prefer="left" class="forecast" label={t('forecast')}>
      <div class="vs">
        <Icon k={forecast.attackerIcon} />
        <span class="range num">{range(forecast.low, forecast.high)}</span>
        <Icon k={forecast.defenderIcon} />
      </div>
      <EnemyLifeBar forecast={forecast} />
      <div class="row">
        <span>{t('destroyIt')}</span>
        <span style={{ color: forecast.killChance >= LIKELY_KILL ? 'var(--gold)' : undefined }}>{pct(forecast.killChance)}</span>
      </div>
      <ForecastDetails forecast={forecast} />
    </Popover>
  );
}

/**
 * Prevision de combate en chapas (docs/PLAN-INTERFAZ-2.md, fase 2): sobre el enemigo, el daño
 * esperado, con la calavera y el % si puede caer (en dorado si es lo probable); sobre tu unidad, lo
 * que te devuelve, en rojo si puede caer (si no contraataca, no sale). Con Alt, la tarjeta con todo.
 */
export function Forecast({ forecast }: { forecast: ForecastVM }) {
  const isDetailed = useAltHeld();
  if (isDetailed) return <ForecastCard forecast={forecast} />;
  const counter = counterBadge(forecast);
  return (
    <>
      <ForecastBadge look={damageBadge(forecast)} anchor={forecast.anchor} label={t('forecast')} cls="damage" />
      {counter && <ForecastBadge look={counter} anchor={forecast.attackerAnchor} label={t('counter')} cls="small counter" />}
    </>
  );
}
