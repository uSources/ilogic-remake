import type { GameImages } from '../../atlas';
import { combatForecast, engagement, flankBonusFor, killReward } from '../../core/rules';
import type { GameState, Pos, TeamId, Unit } from '../../core/model';
import type { Anchor, ForecastVM } from '../../hud/store';
import { AS_ACTIVE, unitKey } from '../sprites';

/** Combate: prevision antes de atacar. */

/** Prevision de combate de `attacker` (colocado en `from`) contra `target`, para el equipo que mira. */
export function forecastVM(
  textures: GameImages,
  s: GameState,
  viewer: TeamId,
  attacker: Unit,
  from: Pos,
  target: Unit,
  anchor: Anchor,
  attackerAnchor: Anchor,
): ForecastVM {
  const forecast = combatForecast(s, engagement(attacker, target, { from }));
  return {
    // El atacante, en color aunque ya se haya movido: es el que va a disparar.
    attackerIcon: unitKey(textures, s, attacker, viewer, AS_ACTIVE),
    defenderIcon: unitKey(textures, s, target, viewer),
    low: forecast.low,
    high: forecast.high,
    expected: forecast.expected,
    lifeBefore: target.life,
    lifeAfter: forecast.lifeAfter,
    killChance: forecast.killChance,
    anchor,
    attackerAnchor,
    flank: flankBonusFor(s, target),
    bounty: killReward(s, target),
    counter: forecast.counter
      ? {
          low: forecast.counter.low,
          high: forecast.counter.high,
          lifeBefore: attacker.life,
          lifeAfter: forecast.counter.lifeAfter,
          killChance: forecast.counter.killChance,
        }
      : null,
  };
}
