import type Phaser from 'phaser';
import { RULES } from '../../core/data';
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
  const f = combatForecast(s, { ...attacker, x: from.x, y: from.y }, target);
  return {
    attackerIcon: unitKey(textures, s, { ...attacker, active: true }),
    defenderIcon: unitKey(textures, s, target),
    low: f.low,
    high: f.high,
    expected: f.expected,
    lifeBefore: target.life,
    lifeAfter: f.lifeAfter,
    killChance: f.killChance,
    anchor,
    flank: flanked(s, target) ? RULES.flankBonus : 0,
    bounty: bountyFor(target.type),
    counter: f.counter
      ? {
          low: f.counter.low,
          high: f.counter.high,
          lifeBefore: attacker.life,
          lifeAfter: f.counter.lifeAfter,
          killChance: f.counter.killChance,
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
  ev: Extract<GameEvent, { kind: 'attack' }>,
  stage: CombatVM['stage'],
  icons: { attacker: string | null; defender: string | null },
  seen: { attacker: boolean; defender: boolean },
  id = 0,
): CombatVM | null {
  const c: CombatInfo | undefined = ev.combat;
  if (!c) return null;
  const counter = ev.counter ?? 0;
  const defTeam = (1 - c.attackerTeam) as 0 | 1;
  const hitDone = stage !== 'start';
  const counterDone = stage === 'counter';
  const side = (role: CombatSideVM['role']): CombatSideVM => {
    const atk = role === 'attacker';
    const known = atk ? seen.attacker : seen.defender;
    const before = atk ? c.attackerLife : c.defenderLife;
    const hurt = atk ? (counterDone ? counter : null) : hitDone ? ev.damage : null;
    const life = Math.max(0, before - (hurt ?? 0));
    return {
      icon: known ? (atk ? icons.attacker : icons.defender) : null,
      name: known ? unitLabel(atk ? c.attackerType : c.defenderType) : '???',
      team: atk ? c.attackerTeam : defTeam,
      role,
      rank: known ? (atk ? c.attackerRank : c.defenderRank) : 0,
      life,
      lifeBefore: before,
      hit: known ? (atk ? c.hit : c.counterHit) : null,
      hurt,
      ko: hurt !== null && life <= 0,
    };
  };
  const a = side('attacker');
  const d = side('defender');
  const playerAttacks = c.attackerTeam === 0;
  return { id, stage, left: playerAttacks ? a : d, right: playerAttacks ? d : a, counter: c.counterHit !== null };
}
