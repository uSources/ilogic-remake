/**
 * Cuanto vale para la IA cada cosa que puede hacer: de momento, cada ataque posible.
 */
import { AI, HQ, POWER, RULES, UNIT } from '../data';
import { canCounter, expectedDamage } from '../rules/combat';
import { captureProgress } from '../rules/capture';
import { buildingAt } from '../rules/queries';
import type { GameState, Pos, Unit } from '../types';
import type { AiCtx } from './context';

/** Valor de un ataque: dano esperado ponderado por el precio del objetivo, y extra si lo mata. */
export function attackScore(s: GameState, ctx: AiCtx, u: Unit, t: Unit, from: Pos = u): number {
  const atk = { ...u, x: from.x, y: from.y };
  const dmg = expectedDamage(s, atk, t);
  const value = UNIT.cost[t.type]! / AI.COSTSCALE;
  // [CAMBIO] Con botin, destruirla ademas da dinero (100 de vida = su precio entero).
  let score = dmg * value + (dmg >= t.life ? (AI.KILLBONUS + 100 * RULES.bounty) * value : 0);
  // [CAMBIO] Reglas nuevas: restar lo que devolveria el contraataque.
  if (RULES.counterattack && dmg < t.life) {
    const left = { ...t, life: Math.max(1, Math.round(t.life - dmg)) };
    if (canCounter(left, atk)) score -= expectedDamage(s, left, atk) * (UNIT.cost[u.type]! / AI.COSTSCALE);
  }
  // Quien defiende su Base encima de ella impide capturarla: hay que echarlo aunque cueste.
  const tb = buildingAt(s, t.x, t.y);
  if (tb && tb.type === HQ && tb.owner === t.team) score += AI.HQDEFENDER * Math.max(0.5, dmg / AI.BONUSDAMAGE);
  // Echar a quien esta capturando un edificio propio (sobre todo la Base).
  const b = buildingAt(s, t.x, t.y);
  if (b && b.owner === ctx.me && captureProgress(s, b))
    score += (b.type === HQ ? AI.STOPCAPTUREHQ : AI.STOPCAPTURE) * Math.max(0.5, dmg / AI.BONUSDAMAGE);
  return score;
}

/** El atacante puede hacer dano a ese tipo de unidad. */
export function attackTargetsPossible(u: Unit, t: Unit): boolean {
  return UNIT.canfight[u.type]! && POWER[u.type]![t.type]! > 0;
}
