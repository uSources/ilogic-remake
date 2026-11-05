import type Phaser from 'phaser';
import { bountyFor, combatForecast, flanked } from '../../core/rules';
import type { CombatInfo, GameEvent, GameState, Pos, Unit } from '../../core/model';
import type { Anchor, CombatSideVM, CombatVM, ForecastVM } from '../../hud/store';
import { unitLabel } from '../../settings';
import { unitKey } from '../sprites';

/** Combate: prevision antes de atacar y panel mientras se anima un ataque. */

/** Prevision de combate de `attacker` (colocado en `from`) contra `target`. */
export function forecastVM(
  textures: Phaser.Textures.TextureManager,
  s: GameState,
  attacker: Unit,
  from: Pos,
  target: Unit,
  anchor: Anchor,
): ForecastVM {
  const forecast = combatForecast(s, { ...attacker, x: from.x, y: from.y }, target);
  return {
    attackerIcon: unitKey(textures, s, { ...attacker, active: true }),
    defenderIcon: unitKey(textures, s, target),
    low: forecast.low,
    high: forecast.high,
    expected: forecast.expected,
    lifeBefore: target.life,
    lifeAfter: forecast.lifeAfter,
    killChance: forecast.killChance,
    anchor,
    flank: flanked(s, target) ? s.rules.flankBonus : 0,
    bounty: bountyFor(s, target.type),
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

/**
 * Panel de combate de un ataque (ver CombatVM) en el momento `stage`. `icons` son las imagenes que
 * habia dibujadas antes del combate y `seen` si el jugador ve a cada una: una unidad en la niebla
 * sale como '???' (no se delata que unidad dispara desde donde no se ve).
 * Devuelve null para eventos antiguos sin datos de combate.
 */
export function combatVM(
  s: GameState,
  event: Extract<GameEvent, { kind: 'attack' }>,
  stage: CombatVM['stage'],
  icons: { attacker: string | null; defender: string | null },
  seen: { attacker: boolean; defender: boolean },
  id = 0,
): CombatVM | null {
  const combat: CombatInfo | undefined = event.combat;
  if (!combat) return null;
  const counter = event.counter ?? 0;
  const defTeam = (1 - combat.attackerTeam) as 0 | 1;
  const hitDone = stage !== 'start';
  const counterDone = stage === 'counter';
  const side = (role: CombatSideVM['role']): CombatSideVM => {
    const isAttacker = role === 'attacker';
    const known = isAttacker ? seen.attacker : seen.defender;
    const before = isAttacker ? combat.attackerLife : combat.defenderLife;
    const hurt = isAttacker ? (counterDone ? counter : null) : hitDone ? event.damage : null;
    const life = Math.max(0, before - (hurt ?? 0));
    return {
      icon: known ? (isAttacker ? icons.attacker : icons.defender) : null,
      name: known ? unitLabel(s.content, isAttacker ? combat.attackerType : combat.defenderType) : '???',
      team: isAttacker ? combat.attackerTeam : defTeam,
      role,
      rank: known ? (isAttacker ? combat.attackerRank : combat.defenderRank) : 0,
      life,
      lifeBefore: before,
      hit: known ? (isAttacker ? combat.hit : combat.counterHit) : null,
      hurt,
      ko: hurt !== null && life <= 0,
    };
  };
  const attacker = side('attacker');
  const defender = side('defender');
  const playerAttacks = combat.attackerTeam === 0;
  return {
    id,
    stage,
    left: playerAttacks ? attacker : defender,
    right: playerAttacks ? defender : attacker,
    counter: combat.counterHit !== null,
  };
}
